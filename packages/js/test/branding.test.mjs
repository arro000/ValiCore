import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as api from '../src/index.js';

const wasm = await readFile(new URL('../bundled/engine.wasm', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url), 'utf8'));
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('ValiCore exposes only its current package API, without old product aliases', async () => {
  assert.equal(packageInfo.name, '@arro000/valicore');
  assert.equal(api.DEFAULT_CHANNEL_URL, 'https://arro000.github.io/ValiCore/dist/channels/v1/latest.json');
  assert.deepEqual(Object.keys(api).sort(), ['DEFAULT_CHANNEL_URL', 'ValiCoreEngine', 'ValiCoreError', 'createValiCore'].sort());
  const engine = await api.createValiCore({ distribution: { mode: 'bundled' } });
  try {
    assert.ok(engine instanceof api.ValiCoreEngine);
    assert.equal(engine.constructor.name, 'ValiCoreEngine');
    assert.equal(engine.versionInfo().runtimeName, 'ValiCore');
    assert.equal(manifest.runtimeName, 'ValiCore');
    assert.throws(() => engine.nameCode(42), error => error instanceof api.ValiCoreError && error.name === 'ValiCoreError');
  } finally { engine.dispose(); }
});

test('WASM exports only current ValiCore ABI symbols, with no obsolete prefix', async () => {
  const module = await WebAssembly.compile(wasm);
  const exports = WebAssembly.Module.exports(module);
  assert.deepEqual(exports.filter(entry => entry.kind === 'function').map(entry => entry.name).sort(),
    ['valicore_alloc', 'valicore_create_json_owned', 'valicore_dealloc', 'valicore_invoke'].sort());
  assert.deepEqual(WebAssembly.Module.imports(module), []);
});

test('custom releases require the current ValiCore product identity', async () => {
  const dataset = { schemaVersion: 1, version: 'branding-fixture', sources: {}, coverage: {}, places: [] };
  for (const runtimeName of [undefined, null, 'CodiceFiscaleCore', 'OtherCore']) {
    await assert.rejects(api.createValiCore({ distribution: { mode: 'custom', wasm, dataset,
      manifest: { ...manifest, dataVersion: dataset.version, runtimeName } } }),
    error => error instanceof api.ValiCoreError && error.code === 'INCOMPATIBLE_MANIFEST');
  }
});
