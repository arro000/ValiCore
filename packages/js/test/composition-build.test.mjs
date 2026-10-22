import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, access, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { compose } from '../tooling/build.js';
import { createValiCore } from '../src/index.js';
import { wasmTransport } from '../tooling/abi.js';
import { loadNotices } from '../tooling/notices.js';
import { componentRegistry } from '../../../tools/composition.mjs';
const profiles = process.env.VALICORE_TEST_PROFILES ?? fileURLToPath(new URL('../bundled/', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
async function temporary(action) {
  const directory = await mkdtemp(join(tmpdir(), 'valicore-build-test-'));
  try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
const build = (config, output, extra = {}) => compose(config, { registry: componentRegistry, precompiledDirectory: profiles, output, ...extra });

test('explicit component selection is verified against the loaded composition', async () => {
  const engine = await createValiCore({ profile: 'fiscal', components: ['fiscal'], datasets: [], distribution: { mode: 'bundled' } });
  try { assert.deepEqual(engine.versionInfo().components, ['fiscal']); } finally { engine.dispose(); }
  await assert.rejects(createValiCore({ profile: 'fiscal', components: ['fiscal', 'iban'], datasets: [], distribution: { mode: 'bundled' } }), { code: 'COMPOSITION_MISMATCH' });
});

test('precompiled CLI works without Rust/PATH and distributes precisely one runtime without data', () => temporary(async directory => {
  for (const profile of Object.keys(componentRegistry.profiles)) {
    const output = join(directory, profile);
    const result = JSON.parse(execFileSync(process.execPath, ['tools/compose.mjs', '--profile', profile, '--precompiled', profiles, '--output', output], {
      cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    }));
    assert.deepEqual((await readdir(output)).sort(), ['engine.wasm', 'manifest.json', 'notices']);
    const notices = await loadNotices(join(output, 'notices'), result.manifest.notices.sha256);
    assert.ok(notices.files.has('rust/COPYRIGHT-library.html'));
    assert.equal(result.build.mode, 'precompiled'); assert.equal(result.manifest.selection.datasets.length, 0);
    const runtime = await wasmTransport(await readFile(join(output, 'engine.wasm')));
    assert.deepEqual(runtime.info.components, result.manifest.components);
    const handle = runtime.create(); runtime.invoke({ op: 'dispose', handle });
  }
}));

test('explicit resources are separate and disabled payload getters are not read', () => temporary(async directory => {
  const resources = { get geo() { throw new Error('disabled geo getter'); }, get aifa() { throw new Error('disabled aifa getter'); } };
  await build({ configVersion: 1, profile: 'fiscal' }, join(directory, 'bare'), { resources });
  const path = join(directory, 'input.json');
  await writeFile(path, JSON.stringify({ schemaVersion: 1, version: 'custom-empty', sources: {}, coverage: {}, places: [] }));
  const result = await build({ configVersion: 1, profile: 'italian', datasets: ['geo'] }, join(directory, 'with-geo'), { resources: { geo: path, get aifa() { throw new Error('disabled'); } } });
  assert.deepEqual((await readdir(result.output)).sort(), ['engine.wasm', 'geo.json', 'manifest.json', 'notices']);
  assert.equal(result.manifest.datasets.geo.version, 'custom-empty');
  assert.deepEqual(Object.keys(result.manifest.datasets), ['geo']);
  assert.ok(!result.manifest.selection.datasets.includes('ateco'));
  const runtime = await wasmTransport(await readFile(join(result.output, 'engine.wasm')));
  const handle = runtime.create(await readFile(join(result.output, 'geo.json')), 'custom-empty');
  assert.equal(runtime.invoke({ op: 'capabilities', handle }).geoHistorical, true); runtime.invoke({ op: 'dispose', handle });
}));

test('invalid resources/builds never promote an output or overwrite user files', () => temporary(async directory => {
  const output = join(directory, 'not-promoted');
  await assert.rejects(build({ configVersion: 1, components: ['geo'] }, output), { code: 'CUSTOM_BUILD_REQUIRED' });
  await assert.rejects(access(output));
  await assert.rejects(build({ configVersion: 1, profile: 'fiscal' }, output, { mode: 'compile' }), { code: 'SOURCE_REQUIRED' });
  await assert.rejects(access(output));
  await assert.rejects(build({ configVersion: 1, profile: 'italian', datasets: ['geo'] }, output), { code: 'DATASET_REQUIRED' });
  const bad = join(directory, 'bad.json'); await writeFile(bad, JSON.stringify({ schemaVersion: 1, version: 'broken', sources: {}, coverage: {}, places: 1 }));
  await assert.rejects(build({ configVersion: 1, profile: 'italian', datasets: ['geo'] }, output, { resources: { geo: bad } }));
  await assert.rejects(access(output));
  const first = await build({ configVersion: 1, profile: 'fiscal' }, output);
  const before = await readFile(join(first.output, 'manifest.json'));
  await assert.rejects(build({ configVersion: 1, profile: 'italian' }, output), { code: 'OUTPUT_EXISTS' });
  assert.deepEqual(await readFile(join(first.output, 'manifest.json')), before);
  assert.ok((await readdir(directory)).every(name => !name.includes('.stage-')));
}));

test('missing/corrupt notices prevent promotion of precompiled runtimes', () => temporary(async directory => {
  const supplied = join(directory, 'profiles');
  await cp(join(profiles, 'fiscal'), join(supplied, 'fiscal'), { recursive: true });
  const path = join(supplied, 'fiscal/wasm/notices');
  await writeFile(join(path, 'PROJECT-LICENSE'), 'corrupted');
  await assert.rejects(build({ configVersion: 1, profile: 'fiscal' }, join(directory, 'rejected'), { precompiledDirectory: supplied }), { code: 'INVALID_NOTICES' });
  await assert.rejects(access(join(directory, 'rejected')));
  await rm(path, { recursive: true });
  await assert.rejects(build({ configVersion: 1, profile: 'fiscal' }, join(directory, 'missing'), { precompiledDirectory: supplied }));
  await assert.rejects(access(join(directory, 'missing')));
}));

test('corrupt hashes and fiscal/geographic superset substitutions are rejected', () => temporary(async directory => {
  const supplied = join(directory, 'profiles'); await cp(join(profiles, 'italian'), join(supplied, 'fiscal'), { recursive: true });
  await assert.rejects(build({ configVersion: 1, profile: 'fiscal' }, join(directory, 'rejected'), { precompiledDirectory: supplied }), { code: 'COMPOSITION_MISMATCH' });
  await cp(join(profiles, 'fiscal'), join(supplied, 'fiscal'), { recursive: true, force: true });
  await writeFile(join(supplied, 'fiscal/wasm/engine.wasm'), 'wrong');
  await assert.rejects(build({ configVersion: 1, profile: 'fiscal' }, join(directory, 'corrupt'), { precompiledDirectory: supplied }), { code: 'HASH_MISMATCH' });
}));
