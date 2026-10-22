import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build as viteBuild } from 'vite';
import valicore from '../tooling/vite.js';
import { loadNotices, validateNotices } from '../tooling/notices.js';

const bundled = fileURLToPath(new URL('../bundled/', import.meta.url));

test('Vite plugin emits exactly the selected profile runtime and requested datasets', async () => {
  const plugin = valicore({ profile: 'italian', datasets: ['geo'],
    resources: { geo: fileURLToPath(new URL('../bundled/places.json', import.meta.url)) } });
  const emitted = [];
  const context = { emitFile: file => emitted.push(file), addWatchFile() {} };
  const code = await plugin.load.call(context, plugin.resolveId('virtual:valicore'));
  assert.ok(typeof code === 'string' && code.includes('createValiCore'));
  assert.deepEqual(emitted.map(file => file.fileName).filter(name => !name.includes('/notices/')).sort(),
    ['valicore/italian/engine.wasm', 'valicore/italian/geo.json', 'valicore/italian/manifest.json']);
  const manifest = JSON.parse(emitted.find(file => file.fileName.endsWith('manifest.json')).source);
  const notices = new Map(emitted.filter(file => file.fileName.startsWith('valicore/italian/notices/')).map(file => [file.fileName.slice('valicore/italian/notices/'.length), file.source]));
  validateNotices(notices, manifest.notices.sha256);
  assert.deepEqual(manifest.components, ['fiscal', 'geo']);
  assert.deepEqual(Object.keys(manifest.datasets), ['geo']);
  assert.equal(manifest.manifestVersion, 2);
});

test('a normal Vite site build ships the selected profile runtime without Rust', async () => {
  const root = await mkdtemp(join(tmpdir(), 'valicore-vite-build-'));
  try {
    await writeFile(join(root, 'index.html'), '<!doctype html><script type="module" src="/main.js"></script>');
    await writeFile(join(root, 'main.js'),
      "import { createValiCore } from 'virtual:valicore';\n"
      + "window.create = () => createValiCore({ distribution: { mode: 'pinned', manifestUrl: new URL('valicore/fiscal/manifest.json', location.href).href } });\n");
    const outDir = join(root, 'dist');
    await viteBuild({ root, plugins: [valicore({ profile: 'fiscal' })], logLevel: 'silent',
      resolve: { alias: { '@arro000/valicore': fileURLToPath(new URL('../src/index.js', import.meta.url)) } },
      build: { outDir, emptyOutDir: true, rollupOptions: { input: join(root, 'index.html') } } });
    const manifest = JSON.parse(await readFile(join(outDir, 'valicore/fiscal/manifest.json'), 'utf8'));
    assert.deepEqual(manifest.components, ['fiscal']);
    assert.equal(manifest.manifestVersion, 2);
    assert.ok((await readFile(join(outDir, 'valicore/fiscal/engine.wasm'))).length > 0);
    await loadNotices(join(outDir, 'valicore/fiscal/notices'), manifest.notices.sha256);
    const { readdir } = await import('node:fs/promises');
    const chunks = (await readdir(join(outDir, 'assets'))).filter(name => name.endsWith('.js'));
    const code = (await Promise.all(chunks.map(name => readFile(join(outDir, 'assets', name), 'utf8')))).join('\n');
    assert.ok(code.includes('valicore/fiscal/manifest.json'), 'built app must reference the emitted profile manifest');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Vite plugin rejects unknown profiles and datasets without touching Rust', async () => {
  const context = { emitFile() {}, addWatchFile() {} };
  const unknown = valicore({ profile: 'unknown' });
  await assert.rejects(unknown.load.call(context, unknown.resolveId('virtual:valicore')), { code: 'INVALID_COMPOSITION' });
  const missingData = valicore({ profile: 'italian', datasets: ['geo'], resources: { geo: undefined } });
  await assert.rejects(missingData.load.call(context, missingData.resolveId('virtual:valicore')), { code: 'DATASET_REQUIRED' });
  assert.equal(valicore().resolveId('other'), undefined);
  assert.equal(valicore().resolveId('virtual:valicore'), '\0virtual:valicore');
  assert.equal(bundled.endsWith('/'), true);
});
