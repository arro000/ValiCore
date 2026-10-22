import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createValiCore } from '../src/index.js';

const base = new URL('../bundled/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const wasm = await readFile(new URL('engine.wasm', base));
const geographic = await readFile(new URL('places.json', base));
const CODE = 'RSSMRA85C15H501R';

test('beta surface reports only implemented fiscal/geographic operations', async () => {
  const engine = await createValiCore();
  try {
    assert.equal(engine.versionInfo().runtimeApiMajor, 8);
    assert.equal(engine.versionInfo().engineVersion, '0.5.0-beta.1');
    assert.deepEqual(engine.versionInfo().components, ['fiscal', 'geo']);
    assert.deepEqual(engine.capabilities(), { fiscalIdentity: true, geoHistorical: true });
    for (const name of ['validateIban', 'validateItalianNre', 'validateAteco', 'lookupItalianAic']) assert.equal(name in engine, false);
    for (const value of [null, 0, 1, 'false', [], {}]) assert.throws(() => engine.omocodes(CODE, { includeBase: value }), { code: 'INVALID_ARGUMENT', field: 'includeBase' });
    assert.equal(engine.omocodes(CODE, { includeBase: false }).length, 127);
  } finally { engine.dispose(); }
});

test('custom raw Uint8Array and ArrayBuffer snapshots verify exact byte hashes', async () => {
  const arrayBuffer = geographic.buffer.slice(geographic.byteOffset, geographic.byteOffset + geographic.byteLength);
  for (const payload of [geographic, arrayBuffer]) {
    const engine = await createValiCore({ distribution: { mode: 'custom', wasm, manifest, datasets: { geo: payload } } });
    try { assert.equal(engine.resolvePlace({ name: 'Roma' }).belfioreCode, 'H501'); } finally { engine.dispose(); }
  }
  const altered = Buffer.from(geographic);
  altered[altered.length - 1] ^= 1;
  await assert.rejects(createValiCore({ distribution: { mode: 'custom', wasm, manifest, datasets: { geo: altered } } }), { code: 'HASH_MISMATCH' });
});

test('opaque custom provenance is preserved without fabricating source dates', async () => {
  const dataset = { schemaVersion: 1, version: 'opaque-source-fixture', sources: { absent: null, numeric: { referenceDate: 42 }, dated: { referenceDate: '2026-01-01' } }, coverage: {}, places: [] };
  const selected = { ...manifest, datasets: { geo: { ...manifest.datasets.geo, version: dataset.version } } };
  const engine = await createValiCore({ distribution: { mode: 'custom', wasm, manifest: selected, datasets: { geo: dataset } } });
  try {
    assert.deepEqual(engine.versionInfo().sourceDates, { absent: null, numeric: null, dated: '2026-01-01' });
    assert.deepEqual(engine.datasetInfo().sources, dataset.sources);
  } finally { engine.dispose(); }
});

test('contradictory dataset selections and removed initialization aliases fail explicitly', async () => {
  for (const options of [{ catalog: false, datasets: ['geo'] }, { catalog: true, datasets: [] }, { ateco: true }, { aic: true }])
    await assert.rejects(createValiCore(options), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(createValiCore({ distribution: { mode: 'custom', wasm, manifest, dataset: {} } }), { code: 'INVALID_ARGUMENT' });
});
