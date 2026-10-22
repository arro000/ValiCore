import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createValiCore, ValiCoreError } from '../src/index.js';

const wasm = await readFile(new URL('../bundled/engine.wasm', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url), 'utf8'));
const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };
const custom = () => ({ mode: 'custom', wasm, manifest });

function exercise(engine) {
  assert.deepEqual(engine.capabilities(), { fiscalIdentity: true, geoHistorical: false });
  assert.equal(engine.versionInfo().dataVersion, null);
  assert.deepEqual(engine.versionInfo().sourceDates, {});
  assert.equal(engine.encode(person), 'RSSMRA85C15H501R');
  assert.equal(engine.nameCode('Mario'), 'MRA');
  assert.equal(engine.surnameCode('Rossi'), 'RSS');
  assert.equal(engine.numericChecksum('0636339100'), '1');
  const decoded = engine.decode('RSSMRA85C15H501R', { yearRange: [1985, 1985] });
  assert.deepEqual(decoded.candidateDates, ['1985-03-15']);
  assert.deepEqual(decoded.places, []);
  assert.equal(decoded.dataVersion, null);
  assert.equal(engine.validate(decoded.code, { level: 'calendar' }).valid, true);
  const territorial = engine.validate(decoded.code);
  assert.equal(territorial.valid, null);
  assert.equal(territorial.checks[3].status, 'unknown');
  assert.equal(territorial.checks[3].error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(engine.validate('06363391001').valid, true);
  const match = engine.matchesPerson(decoded.code, person);
  assert.equal(match.matches, true);
  assert.equal(match.validation.level, 'calendar');
  for (const [method, args] of [['datasetInfo', []], ['searchPlaces', ['Roma']], ['listProvinces', []],
    ['resolvePlace', [{ belfioreCode: 'H501' }]]]) {
    assert.throws(() => engine[method](...args), error => error instanceof ValiCoreError && error.code === 'CAPABILITY_UNAVAILABLE');
  }
  for (const birthplace of [{ name: 'Roma' }, { istatCode: '058091' },
    { belfioreCode: 'H501', province: 'RM' }, { belfioreCode: 'H501', onDate: '1985-03-15' }]) {
    assert.throws(() => engine.encode({ ...person, birthplace }), error => error.code === 'CAPABILITY_UNAVAILABLE');
  }
  for (const code of engine.omocodes(decoded.code)) {
    assert.equal(engine.sameBase(code, decoded.code), true);
    assert.equal(engine.decode(code, { yearRange: [1985, 1985] }).sex, 'M');
  }
}

test('custom algorithm-only initialization never accesses supplied dataset or geographic manifest fields', async () => {
  const distribution = custom();
  Object.defineProperty(distribution, 'datasets', { get() { throw new Error('Datasets must not be accessed'); } });
  distribution.manifest = { ...manifest };
  for (const field of ['datasets']) Object.defineProperty(distribution.manifest, field,
    { get() { throw new Error(`Geographic manifest field ${field} must not be accessed`); } });
  const engine = await createValiCore({ catalog: false, distribution });
  try { exercise(engine); }
  finally { engine.dispose(); }
  engine.dispose();
  assert.throws(() => engine.capabilities(), error => error.code === 'ENGINE_DISPOSED');
});

test('bundled algorithm-only mode works in a package with no dataset file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'valicore-no-catalog-'));
  try {
    await mkdir(join(directory, 'src')); await mkdir(join(directory, 'bundled'));
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await copyFile(new URL('../src/index.js', import.meta.url), join(directory, 'src/index.js'));
    await writeFile(join(directory, 'bundled/manifest.json'), JSON.stringify(manifest));
    await writeFile(join(directory, 'bundled/engine.wasm'), wasm);
    const api = await import(pathToFileURL(join(directory, 'src/index.js')).href);
    const engine = await api.createValiCore({ catalog: false, distribution: { mode: 'bundled' } });
    try { assert.equal(engine.encode(person), 'RSSMRA85C15H501R'); assert.equal(engine.versionInfo().dataVersion, null); }
    finally { engine.dispose(); }
    await assert.rejects(api.createValiCore({ distribution: { mode: 'bundled' } }), error => error.code === 'ENOENT');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('online/pinned/cache initialization skips data requests and runtime-only caches never promote full releases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'valicore-runtime-cache-'));
  const requests = [];
  let offline = false;
  const remote = { ...manifest,
    runtime: { wasm: { url: '/engine.wasm', sha256: manifest.runtime.wasm.sha256 } },
    datasets: { geo: { ...manifest.datasets.geo, version: 'runtime-only-remote', url: '/data.json' } } };
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (offline) { response.statusCode = 503; return response.end('Offline'); }
    if (request.url === '/latest.json') return response.end(JSON.stringify(remote));
    if (request.url === '/engine.wasm') return response.end(wasm);
    response.statusCode = 503; response.end('Dataset deliberately unavailable');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const channelUrl = `http://127.0.0.1:${server.address().port}/latest.json`;
  const distribution = { mode: 'online', channelUrl, cacheDirectory: directory, timeoutMs: 1000 };
  try {
    const online = await createValiCore({ catalog: false, distribution: { ...distribution, fallback: false } });
    try { exercise(online); assert.equal(online.versionInfo().origin, 'remote'); }
    finally { online.dispose(); }
    const pinned = await createValiCore({ catalog: false, distribution: { ...distribution, mode: 'pinned', manifestUrl: channelUrl } });
    pinned.dispose();
    assert.deepEqual(requests, ['/latest.json', '/engine.wasm', '/latest.json']);
    offline = true;
    const cached = await createValiCore({ catalog: false, distribution });
    try { assert.equal(cached.versionInfo().origin, 'cache'); assert.equal(cached.versionInfo().dataVersion, null); }
    finally { cached.dispose(); }
    const full = await createValiCore({ distribution });
    try {
      assert.equal(full.versionInfo().origin, 'bundled');
      assert.equal(full.versionInfo().dataVersion, manifest.datasets.geo.version);
      assert.equal(full.capabilities().geoHistorical, true);
    } finally { full.dispose(); }
    await assert.rejects(createValiCore({ catalog: false, distribution: { ...distribution, mode: 'pinned', manifestUrl: channelUrl } }), error => error.code === 'DOWNLOAD_FAILED');
    assert.ok(!requests.includes('/data.json'));
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('runtime-only manifests are supported, but invalid configuration and module identities are rejected', async () => {
  const { datasets, selection, ...runtimeManifest } = manifest;
  const engine = await createValiCore({ catalog: false, distribution: { ...custom(), manifest: runtimeManifest } });
  engine.dispose();
  await assert.rejects(createValiCore({ distribution: { ...custom(), manifest: runtimeManifest } }), error => error.code === 'DATASET_UNAVAILABLE');
  for (const catalog of [null, 0, 1, 0.5, 'false', {}, []]) {
    await assert.rejects(createValiCore({ catalog, distribution: custom() }), error => error.code === 'INVALID_ARGUMENT');
  }
  for (const options of [null, false, [], 123, { modules: ['fiscal_identity'] }, { distribution: null }]) {
    await assert.rejects(createValiCore(options), error => error.code === 'INVALID_ARGUMENT');
  }
  for (const modules of [undefined, null, [], [false], ['fiscal_identity', 'fiscal_identity']]) {
    await assert.rejects(createValiCore({ catalog: false, distribution: { ...custom(), manifest: { ...manifest, modules } } }), error => error.code === 'INVALID_MANIFEST');
  }
  await assert.rejects(createValiCore({ catalog: false, distribution: { ...custom(), manifest: { ...manifest, modules: ['fiscal_identity'] } } }), error => error.code === 'INCOMPATIBLE_RUNTIME');
});
