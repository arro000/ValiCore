import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createValiCore } from '../src/index.js';

const wasm = await readFile(new URL('../bundled/engine.wasm', import.meta.url));
const original = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const dataset = { schemaVersion: 1, version: 'transport-fixture', sources: {}, coverage: {}, places: [] };

async function serverFixture(run) {
  let config = {};
  const server = createServer((request, response) => {
    const bytes = Buffer.from(JSON.stringify(config.dataset ?? dataset));
    const manifest = { ...original,
      runtime: { wasm: { url: '/engine.wasm', sha256: digest(wasm) } },
      datasets: { geo: { ...original.datasets.geo, version: dataset.version, url: '/data.json', sha256: digest(bytes) } }, ...config.manifest };
    if (config.delay) return; // Client timeout; sockets are explicitly closed below.
    if (request.url === '/latest.json') {
      response.statusCode = config.status ?? 200;
      response.end(config.rawManifest ?? JSON.stringify(manifest));
    } else if (request.url === '/engine.wasm') response.end(config.corruptWasm ? Buffer.from('bad WASM') : wasm);
    else if (request.url === '/data.json') response.end(config.corruptData ? Buffer.from('{}') : bytes);
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const channelUrl = `http://127.0.0.1:${server.address().port}/latest.json`;
  const distribution = { mode: 'online', channelUrl, cache: false, fallback: false, timeoutMs: 1000 };
  try { await run(distribution, value => { config = value; }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('HTTP, resource-integrity, manifest, dataset and runtime failure matrix is rejected in strict mode', async () => {
  await serverFixture(async (distribution, configure) => {
    for (const [configuration, expected] of [
      [{ status: 404 }, 'DOWNLOAD_FAILED'], [{ status: 500 }, 'DOWNLOAD_FAILED'],
      ...[undefined, null, 'CodiceFiscaleCore', 'OtherCore'].map(runtimeName => [{ manifest: { runtimeName } }, 'INCOMPATIBLE_MANIFEST']),
      [{ manifest: { manifestVersion: 3 } }, 'INCOMPATIBLE_MANIFEST'], [{ manifest: { loaderProtocol: 1 } }, 'INCOMPATIBLE_MANIFEST'],
      [{ manifest: { runtimeApiMajor: 6 } }, 'INCOMPATIBLE_MANIFEST'],
      [{ manifest: { runtimeApiMajor: 4 } }, 'INCOMPATIBLE_MANIFEST'],
      [{ manifest: { buildId: null } }, 'INVALID_MANIFEST'], [{ manifest: { runtime: {} } }, 'INVALID_MANIFEST'],
      [{ manifest: { datasets: { geo: { ...original.datasets.geo, url: '/data.json', sha256: 'invalid' } } } }, 'INVALID_MANIFEST'],
      [{ manifest: { datasets: { geo: { ...original.datasets.geo, url: 'file:///data.json', sha256: '0'.repeat(64) } } } }, 'INVALID_URL'],
      [{ corruptWasm: true }, 'HASH_MISMATCH'], [{ corruptData: true }, 'HASH_MISMATCH'],
      [{ dataset: { ...dataset, version: 'other' } }, 'INCOMPATIBLE_DATASET'], [{ dataset: { ...dataset, schemaVersion: 2 } }, 'INCOMPATIBLE_DATASET'],
      [{ manifest: { engineVersion: 'other' } }, 'INCOMPATIBLE_RUNTIME'],
      [{ dataset: { ...dataset, places: [{ id: 'bad' }] } }, 'INVALID_ARGUMENT'],
    ]) {
      configure(configuration);
      await assert.rejects(createValiCore({ distribution }), error => error.code === expected, JSON.stringify(configuration));
    }
    configure({ rawManifest: '{' });
    await assert.rejects(createValiCore({ distribution }), SyntaxError);
    for (const value of [null, false, 42, 'manifest', []]) {
      configure({ rawManifest: JSON.stringify(value) });
      await assert.rejects(createValiCore({ distribution }), error => error.code === 'INVALID_MANIFEST');
    }
  });
});

test('timeouts and non-HTTP URLs are bounded, and pinned mode never silently falls back', async () => {
  await serverFixture(async (distribution, configure) => {
    configure({ delay: true });
    await assert.rejects(createValiCore({ distribution: { ...distribution, timeoutMs: 25 } }), error => error.name === 'TimeoutError');
    for (const timeoutMs of [0, -1, 1.5, NaN]) {
      await assert.rejects(createValiCore({ distribution: { ...distribution, timeoutMs } }), error => error.code === 'INVALID_ARGUMENT');
    }
    configure({ corruptData: true });
    await assert.rejects(createValiCore({ distribution: { ...distribution, mode: 'pinned', manifestUrl: distribution.channelUrl, fallback: true } }), error => error.code === 'HASH_MISMATCH');
  });
  for (const channelUrl of ['file:///latest.json', 'ftp://example.com/latest.json', 'data:text/plain,{}']) {
    await assert.rejects(createValiCore({ distribution: { mode: 'online', channelUrl } }), error => error.code === 'INVALID_URL');
  }
});

test('corrupted cache resources are repaired online, incomplete caches cannot be mixed with other releases', async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), 'valicore-edge-cache-'));
  try {
    await serverFixture(async (distribution, configure) => {
      const cached = { ...distribution, cache: true, cacheDirectory, fallback: true };
      const first = await createValiCore({ distribution: cached }); first.dispose();
      const dataHash = digest(Buffer.from(JSON.stringify(dataset)));
      const resourcePath = join(cacheDirectory, digest(Buffer.from(`resource:${dataHash}`)));
      await writeFile(resourcePath, 'broken cached resource');
      const repaired = await createValiCore({ distribution: cached });
      assert.equal(repaired.versionInfo().origin, 'remote'); repaired.dispose();
      assert.equal(digest(await readFile(resourcePath)), dataHash);
      await rm(resourcePath);
      configure({ status: 503 });
      const fallback = await createValiCore({ distribution: cached });
      assert.equal(fallback.versionInfo().origin, 'bundled');
      assert.notEqual(fallback.versionInfo().dataVersion, dataset.version); fallback.dispose();
      // An invalid newly downloaded release must not replace the complete manifest.
      configure({ dataset: { ...dataset, version: 'unpromotable' } });
      await assert.rejects(createValiCore({ distribution: { ...cached, fallback: false } }), error => error.code === 'INCOMPATIBLE_DATASET');
    });
  } finally { await rm(cacheDirectory, { recursive: true, force: true }); }
});

test('unwritable optional cache storage does not block an otherwise valid remote release', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'valicore-edge-cache-file-'));
  const cacheDirectory = join(directory, 'not-a-directory'); await writeFile(cacheDirectory, 'file');
  try {
    await serverFixture(async distribution => {
      const cf = await createValiCore({ distribution: { ...distribution, cache: true, cacheDirectory } });
      assert.equal(cf.versionInfo().origin, 'remote'); cf.dispose();
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
