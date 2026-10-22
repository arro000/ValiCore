import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createValiCore } from '../src/index.js';

const wasm = await readFile(new URL('../bundled/engine.wasm', import.meta.url));
const original = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataset = { schemaVersion: 1, version: 'compressed-fixture', sources: {}, coverage: {},
  places: [{ id: 'roma', sourceId: 'test', sourceRecordId: '1', name: 'ROMA', aliases: [], kind: 'municipality',
    status: 'active', belfioreCode: 'H501', istatCode: '058091', province: 'RM', validFrom: '1900-01-01', validTo: null }] };

async function fixture(run) {
  const runtime = wasm;
  let settings = {};
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    const plain = Buffer.from(settings.raw ?? JSON.stringify(dataset));
    const compressed = settings.gzip ?? gzipSync(plain);
    const packedWasm = gzipSync(runtime);
    const manifest = { ...original,
      runtime: { wasm: { url: '/engine.wasm', sha256: hash(runtime), gzip: { url: '/engine.wasm.gz', sha256: hash(packedWasm) } } },
      datasets: { geo: { version: dataset.version, schemaVersion: 1, url: '/places.json', sha256: settings.rawHash ?? hash(plain),
        gzip: settings.gzipRef ?? { url: '/places.json.gz', sha256: settings.gzipHash ?? hash(compressed) } } } };
    if (request.url === '/latest.json') response.end(JSON.stringify(manifest));
    else if (request.url === '/places.json.gz') response.end(compressed);
    else if (request.url === '/engine.wasm.gz') response.end(packedWasm);
    else if (request.url === '/places.json') response.end(plain);
    else if (request.url === '/engine.wasm') response.end(runtime);
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const distribution = { mode: 'online', channelUrl: `http://127.0.0.1:${server.address().port}/latest.json`, cache: false, fallback: false };
  try { await run(distribution, value => { settings = value; }, requests); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('explicit gzip resources avoid raw downloads and retain content-addressed cache reuse', async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), 'valicore-compressed-cache-'));
  try {
    await fixture(async (distribution, configure, requests) => {
      const options = { distribution: { ...distribution, cache: true, cacheDirectory } };
      for (let i = 0; i < 2; i++) {
        const cf = await createValiCore(options);
        assert.equal(cf.encode({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { name: 'Roma' } }), 'RSSMRA85C15H501R');
        assert.equal(cf.datasetInfo().placeCount, 1); cf.dispose();
      }
      assert.equal(requests.filter(path => path === '/places.json.gz').length, 1);
      assert.equal(requests.filter(path => path === '/engine.wasm.gz').length, 1);
      assert.equal(requests.filter(path => path === '/latest.json').length, 2);
      assert.ok(!requests.includes('/places.json') && !requests.includes('/engine.wasm'));
    });
  } finally { await rm(cacheDirectory, { recursive: true, force: true }); }
});

test('compressed and decoded hashes, gzip structure and reference URLs are independently checked', async () => {
  await fixture(async (distribution, configure) => {
    for (const [settings, code] of [
      [{ gzipHash: '0'.repeat(64) }, 'HASH_MISMATCH'],
      [{ rawHash: '0'.repeat(64) }, 'HASH_MISMATCH'],
      [{ gzip: Buffer.from('not gzip') }, 'INVALID_COMPRESSION'],
      [{ gzipRef: { url: 'file:///places.gz', sha256: '0'.repeat(64) } }, 'INVALID_URL'],
      [{ gzipRef: { url: '/places.json.gz', sha256: 'bad' } }, 'INVALID_MANIFEST'],
    ]) {
      configure(settings);
      await assert.rejects(createValiCore({ distribution }), error => error.code === code);
    }
  });
});

test('raw dataset fast path preserves malformed JSON/type failures and duplicate-field JSON semantics', async () => {
  await fixture(async (distribution, configure) => {
    for (const [raw, expected] of [
      ['{', SyntaxError], ['null', TypeError], ['[]', 'INCOMPATIBLE_DATASET'],
      [JSON.stringify({ ...dataset, schemaVersion: 2, places: [{ id: 'bad' }] }), 'INCOMPATIBLE_DATASET'],
      [JSON.stringify({ ...dataset, places: [{ id: 'bad' }] }), 'INVALID_ARGUMENT'],
    ]) {
      configure({ raw });
      await assert.rejects(createValiCore({ distribution }), error => typeof expected === 'string' ? error.code === expected : error instanceof expected);
    }
    for (const raw of [
      JSON.stringify(dataset).replace('"schemaVersion":1', '"schemaVersion":2,"schemaVersion":1'),
      JSON.stringify(dataset).replace('"name":"ROMA"', '"name":"WRONG","name":"ROMA"'),
    ]) {
      configure({ raw });
      const cf = await createValiCore({ distribution });
      assert.equal(cf.resolvePlace({ name: 'Roma' }).belfioreCode, 'H501'); cf.dispose();
    }
  });
});
