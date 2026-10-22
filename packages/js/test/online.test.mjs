import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createValiCore } from '../src/index.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const local = new URL('../bundled/', import.meta.url);
const wasm = await readFile(new URL('engine.wasm', local));
const initial = JSON.parse(await readFile(new URL('places.json', local), 'utf8'));
const bundledManifest = JSON.parse(await readFile(new URL('manifest.json', local), 'utf8'));

test('same installed wrapper loads a new dataset, then falls back to a complete cached release', async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), 'valicore-online-'));
  let dataset = initial, corrupt = false;
  const server = createServer((request, response) => {
    const bytes = Buffer.from(JSON.stringify(dataset));
    const manifest = { ...bundledManifest, runtime: { wasm: { url: '/engine.wasm', sha256: hash(wasm) } }, datasets: { geo: { ...bundledManifest.datasets.geo, version: dataset.version, url: `/data/${dataset.version}.json`, sha256: corrupt ? '0'.repeat(64) : hash(bytes) } } };
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/latest.json') response.end(JSON.stringify(manifest));
    else if (request.url === '/engine.wasm') response.end(wasm);
    else if (request.url?.startsWith('/data/')) response.end(bytes);
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const channelUrl = `http://127.0.0.1:${server.address().port}/latest.json`;
  const distribution = { mode: 'online', channelUrl, cacheDirectory, timeoutMs: 1000 };
  try {
    const before = await createValiCore({ distribution });
    assert.equal(before.versionInfo().origin, 'remote');
    dataset = structuredClone(initial);
    dataset.version = 'test-resync-new-place';
    dataset.places.push({ ...dataset.places.find(place => place.belfioreCode === 'H501'), id: 'fixture:new', sourceRecordId: 'new', name: 'TEST NEW MUNICIPALITY', aliases: [], belfioreCode: 'M999' });
    const after = await createValiCore({ distribution });
    assert.equal(after.resolvePlace({ name: 'Test New Municipality' }).belfioreCode, 'M999');
    assert.equal(before.resolvePlace({ name: 'Test New Municipality' }).status, 'missing');
    corrupt = true;
    dataset = { ...dataset, version: 'corrupt-release' };
    const recovered = await createValiCore({ distribution });
    assert.equal(recovered.versionInfo().origin, 'cache');
    assert.equal(recovered.versionInfo().dataVersion, 'test-resync-new-place');
    await assert.rejects(() => createValiCore({ distribution: { ...distribution, fallback: false } }), error => error.code === 'HASH_MISMATCH');
    await new Promise(resolve => server.close(resolve));
    const offline = await createValiCore({ distribution });
    assert.equal(offline.versionInfo().origin, 'cache');
    assert.equal(offline.resolvePlace({ name: 'Test New Municipality' }).belfioreCode, 'M999');
    for (const engine of [before, after, recovered, offline]) engine.dispose();
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});

test('incompatible channels are rejected in strict mode', async () => {
  const server = createServer((_, response) => response.end(JSON.stringify({ ...bundledManifest, runtimeApiMajor: 6 })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(() => createValiCore({ distribution: { mode: 'online', channelUrl: `http://127.0.0.1:${server.address().port}/`, cache: false, fallback: false } }), error => error.code === 'INCOMPATIBLE_MANIFEST');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
