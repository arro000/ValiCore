import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createValiCore, DEFAULT_CHANNEL_URL } from '../src/index.js';
import { createValiCore as createFiscal } from '../src/fiscal.js';

const registry = JSON.parse(await readFile(new URL('../bundled/registry.json', import.meta.url), 'utf8'));
const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };

function noNetwork(t) {
  return t.mock.method(globalThis, 'fetch', () => { throw new Error('Implicit remote access is forbidden'); });
}

test('omitted distribution loads the complete local release without remote attempts or fallback', async t => {
  const fetch = noNetwork(t);
  for (const options of [undefined, {}, { distribution: undefined }]) {
    const engine = await createValiCore(options);
    try {
      assert.equal(engine.versionInfo().origin, 'bundled');
      assert.equal(engine.versionInfo().fallbackReason, undefined);
      assert.equal(engine.encode(person), 'RSSMRA85C15H501R');
      assert.equal(engine.resolvePlace({ name: 'Roma', province: 'RM' }).belfioreCode, 'H501');
    } finally { engine.dispose(); }
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('algorithm-only default avoids network while preserving no-catalog uncertainty', async t => {
  const fetch = noNetwork(t);
  const engine = await createValiCore({ datasets: [] });
  try {
    assert.equal(engine.versionInfo().origin, 'bundled');
    assert.equal(engine.versionInfo().dataVersion, null);
    assert.equal(engine.validate('RSSMRA85C15H501R').valid, null);
    assert.equal(engine.validate('RSSMRA85C15H501R', { level: 'calendar' }).valid, true);
  } finally { engine.dispose(); }
  assert.equal(fetch.mock.callCount(), 0);
});

test('explicit online profiles use their own channel and never silently load an integrated superset', async t => {
  const local = new URL('../bundled/fiscal/wasm/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', local), 'utf8'));
  const wasm = await readFile(new URL('engine.wasm', local));
  const urls = [];
  const channel = new URL('fiscal.json', DEFAULT_CHANNEL_URL).href;
  const runtimeUrl = 'https://example.test/fiscal.wasm';
  manifest.runtime.wasm.url = runtimeUrl;
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url));
    if (String(url) === channel) return new Response(JSON.stringify(manifest));
    if (String(url) === runtimeUrl) return new Response(wasm);
    throw new Error('Unexpected resource');
  });
  let engine = await createFiscal({ distribution: { mode: 'online', cache: false, fallback: false } });
  try {
    assert.equal(engine.versionInfo().origin, 'remote');
    assert.deepEqual(engine.versionInfo().components, ['fiscal']);
    assert.deepEqual(urls, [channel, runtimeUrl]);
  } finally { engine.dispose(); }
  const integrated = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url), 'utf8'));
  fetch.mock.mockImplementation(async () => new Response(JSON.stringify(integrated)));
  await assert.rejects(createFiscal({ distribution: { mode: 'online', cache: false, fallback: false } }), { code: 'COMPOSITION_MISMATCH' });
  await assert.rejects(createFiscal({ distribution: { mode: 'pinned', manifestUrl: channel, cache: false } }), { code: 'COMPOSITION_MISMATCH' });
  engine = await createFiscal({ distribution: { mode: 'online', cache: false } });
  try {
    assert.equal(engine.versionInfo().origin, 'bundled');
    assert.deepEqual(engine.versionInfo().components, ['fiscal']);
    assert.match(engine.versionInfo().fallbackReason, /composition/);
  } finally { engine.dispose(); }
});

test('profile/component contradictions are rejected before remote access', async t => {
  const fetch = noNetwork(t);
  await assert.rejects(createValiCore({ profile: 'fiscal', components: ['fiscal', 'iban'], distribution: { mode: 'online', cache: false } }), { code: 'COMPOSITION_MISMATCH' });
  await assert.rejects(createValiCore({ profile: 'unknown' }), { code: 'INVALID_ARGUMENT' });
  assert.equal(fetch.mock.callCount(), 0);
});

test('every published granular entrypoint initializes locally with no implicit dataset', async t => {
  const fetch = noNetwork(t);
  const package_ = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const codeProfiles = Object.keys(package_.exports).filter(key => !['.', './ui', './build', './vite', './bundled/*'].includes(key)).map(key => key.slice(2));
  assert.deepEqual(codeProfiles.sort(), Object.keys(registry.profiles).sort(), 'Do not export nonexistent profiles');
  for (const profile of Object.keys(registry.profiles)) {
    const { createValiCore: create } = await import(`../src/${profile}.js`);
    for (const initialize of [() => create(), () => createValiCore({ profile })]) {
      const engine = await initialize();
      try {
        assert.equal(engine.versionInfo().origin, 'bundled');
        assert.deepEqual(engine.versionInfo().components, registry.profiles[profile]);
        assert.equal(engine.versionInfo().dataVersion, null);
      } finally { engine.dispose(); }
    }
  }
  await assert.rejects(createValiCore({ profile: 'fiscal', catalog: true }), { code: 'DATASET_UNAVAILABLE' });
  assert.equal(fetch.mock.callCount(), 0);
});
