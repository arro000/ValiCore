import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync, brotliCompressSync, constants } from 'node:zlib';
import { resolve, join } from 'node:path';
import { compose, verifyRuntimeInfo } from '../packages/js/tooling/build.js';
import { normalizeComposition } from '../packages/js/tooling/config.js';
import { wasmTransport } from '../packages/js/tooling/abi.js';
import { loadNotices, validateNotices, writeNotices } from '../packages/js/tooling/notices.js';
import { componentRegistry } from './composition.mjs';
import { collectWorkspaceNotices } from './build_notices.mjs';

const root = resolve(import.meta.dirname, '..');
const archived = process.argv.includes('--archived');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function immutable(path, bytes, compressed = false) {
  try {
    const old = await readFile(path);
    if (!(compressed ? gunzipSync(old).equals(gunzipSync(bytes)) : old.equals(bytes))) throw new Error(`Immutable archive collision: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function representations(path, bytes, gzipBytes) {
  await writeFile(`${path}.gz`, gzipBytes ?? gzipSync(bytes, { level: 9, mtime: 0 }));
  await writeFile(`${path}.br`, brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
}
const state = JSON.parse(await readFile(join(root, 'data/state.json'), 'utf8'));
const version = JSON.parse(await readFile(join(root, 'packages/js/package.json'), 'utf8')).version;
const selection = normalizeComposition({ configVersion: 1, profile: 'italian', datasets: ['geo'] }, componentRegistry);
const dataArchive = await readFile(join(root, 'data', state.snapshot));
const dataBytes = gunzipSync(dataArchive);
const dataset = JSON.parse(dataBytes);
if (dataset.version !== state.version || dataset.schemaVersion !== selection.schemas.geo
  || typeof dataset.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dataset.version)) throw new Error('Geographic snapshot/state/schema identity disagrees');

let previous, wasm, notices;
if (archived) {
  const directory = join(root, 'artifacts/releases');
  const releases = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.json'))
    .map(async name => JSON.parse(await readFile(join(directory, name), 'utf8'))));
  previous = releases.filter(value => value.runtimeName === 'ValiCore' && value.engineVersion === version
    && value.runtimeApiMajor === selection.runtimeApiMajor && value.loaderProtocol === selection.loaderProtocol
    && value.datasets?.geo?.version === dataset.version && /^[a-f0-9]{64}$/.test(value.notices?.sha256))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (!previous) throw new Error('No archived beta runtime/data/notices match this source version. Build current source first.');
  wasm = gunzipSync(await readFile(join(root, 'artifacts/runtime', `${previous.buildId}.wasm.gz`)));
  if (hash(wasm) !== previous.runtime.wasm.sha256) throw new Error('Archived runtime hash differs');
  const saved = JSON.parse(gunzipSync(await readFile(join(root, 'artifacts/notices', `${previous.buildId}-${previous.notices.sha256}.json.gz`))));
  if (saved.runtimeSha256 !== hash(wasm)) throw new Error('Archived notices belong to another runtime');
  notices = { files: new Map(saved.files.map(([name, bytes]) => [name, Buffer.from(bytes, 'base64')])) };
  notices.index = validateNotices(notices.files, previous.notices.sha256);
} else {
  wasm = await readFile(join(root, 'target/wasm32-unknown-unknown/release/valicore_abi.wasm'));
  notices = await collectWorkspaceNotices(root);
}
const runtime = await wasmTransport(wasm);
verifyRuntimeInfo(runtime.info, selection);
if (runtime.info.engineVersion !== version) throw new Error('Runtime/package version differs; rebuild current source');
const handle = runtime.create(dataBytes, dataset.version);
runtime.invoke({ op: 'dispose', handle });
const wasmHash = hash(wasm), buildId = wasmHash.slice(0, 20), noticeHash = hash(notices.files.get('index.json'));
validateNotices(notices.files, noticeHash);
const archiveRoot = join(root, 'artifacts');
if (!archived) {
  await mkdir(join(archiveRoot, 'runtime'), { recursive: true });
  await mkdir(join(archiveRoot, 'notices'), { recursive: true });
  await immutable(join(archiveRoot, 'runtime', `${buildId}.wasm.gz`), gzipSync(wasm, { mtime: 0 }), true);
  await immutable(join(archiveRoot, 'runtime', `${buildId}.json`), json({ buildId, sha256: wasmHash, ...runtime.info }));
  const saved = Buffer.from(JSON.stringify({ runtimeSha256: wasmHash, files: [...notices.files].map(([name, bytes]) => [name, bytes.toString('base64')]) }) + '\n');
  await immutable(join(archiveRoot, 'notices', `${buildId}-${noticeHash}.json.gz`), gzipSync(saved, { level: 9, mtime: 0 }), true);
}

const distribution = join(root, 'distribution');
await rm(distribution, { recursive: true, force: true }); // Owned output, never source evidence.
await mkdir(join(distribution, 'channels/v1'), { recursive: true });
const runtimePath = join(distribution, 'runtime', buildId);
await mkdir(runtimePath, { recursive: true });
await writeFile(join(runtimePath, 'engine.wasm'), wasm);
await representations(join(runtimePath, 'engine.wasm'), wasm, await readFile(join(archiveRoot, 'runtime', `${buildId}.wasm.gz`)));
await mkdir(join(distribution, 'notices'), { recursive: true });
await writeNotices(join(distribution, 'notices', noticeHash), notices);
const dataPath = join(distribution, 'data', dataset.version);
await mkdir(dataPath, { recursive: true });
await writeFile(join(dataPath, 'places.json'), dataBytes);
await representations(join(dataPath, 'places.json'), dataBytes, dataArchive);
await writeFile(join(dataPath, 'manifest.json'), json({ version: dataset.version, schemaVersion: dataset.schemaVersion,
  sha256: hash(dataBytes), sources: dataset.sources, coverage: dataset.coverage }));
const wasmGzip = await readFile(join(runtimePath, 'engine.wasm.gz'));
const manifest = {
  manifestVersion: 2, ...runtime.info, buildId,
  publishedAt: previous?.publishedAt ?? new Date().toISOString(),
  runtimeCompositionHash: selection.runtimeCompositionHash, compositionHash: selection.compositionHash,
  selection: { configVersion: 1, components: selection.components, datasets: ['geo'] },
  runtime: { wasm: { url: `../../runtime/${buildId}/engine.wasm`, sha256: wasmHash,
    gzip: { url: `../../runtime/${buildId}/engine.wasm.gz`, sha256: hash(wasmGzip) } } },
  notices: { url: `../../notices/${noticeHash}/index.json`, sha256: noticeHash },
  datasets: { geo: { url: `../../data/${dataset.version}/places.json`, sha256: hash(dataBytes), bytes: dataBytes.length,
    version: dataset.version, schemaVersion: dataset.schemaVersion,
    gzip: { url: `../../data/${dataset.version}/places.json.gz`, sha256: hash(dataArchive) } } },
};
await writeFile(join(distribution, 'channels/v1/latest.json'), json(manifest));
const pinned = structuredClone(manifest);
pinned.runtime.wasm.url = `../runtime/${buildId}/engine.wasm`;
pinned.runtime.wasm.gzip.url = `../runtime/${buildId}/engine.wasm.gz`;
pinned.datasets.geo.url = `../data/${dataset.version}/places.json`;
pinned.datasets.geo.gzip.url = `../data/${dataset.version}/places.json.gz`;
pinned.notices.url = `../notices/${noticeHash}/index.json`;
const releaseId = `${buildId}-${dataset.version}-notices-${noticeHash}`;
await mkdir(join(archiveRoot, 'releases'), { recursive: true });
try { await readFile(join(archiveRoot, 'releases', `${releaseId}.json`)); }
catch (error) { if (error.code !== 'ENOENT') throw error; await immutable(join(archiveRoot, 'releases', `${releaseId}.json`), json(pinned)); }
await mkdir(join(distribution, 'releases'), { recursive: true });
await copyFile(join(archiveRoot, 'releases', `${releaseId}.json`), join(distribution, 'releases', `${releaseId}.json`));

const bundled = join(root, 'packages/js/bundled');
await rm(bundled, { recursive: true, force: true });
await mkdir(bundled, { recursive: true });
const local = structuredClone(manifest);
local.runtime.wasm = { url: 'engine.wasm', sha256: wasmHash };
local.datasets.geo = { ...local.datasets.geo, url: 'places.json' };
delete local.datasets.geo.gzip;
local.notices.url = 'notices/index.json';
await writeFile(join(bundled, 'manifest.json'), json(local));
await writeFile(join(bundled, 'registry.json'), json(componentRegistry));
await writeFile(join(bundled, 'engine.wasm'), wasm);
await writeFile(join(bundled, 'places.json'), dataBytes);
await writeNotices(join(bundled, 'notices'), notices);
await copyFile(join(root, 'LICENSE'), join(root, 'packages/js/LICENSE'));
const profiles = [];
if (!archived) for (const profile of Object.keys(componentRegistry.profiles)) {
  const output = join(bundled, profile, 'wasm');
  const result = await compose({ configVersion: 1, profile }, { registry: componentRegistry, mode: 'compile', target: 'wasm',
    sourceRoot: root, output, cargoTargetDirectory: join(root, 'target/compositions') });
  const ref = result.manifest.runtime.wasm, bytes = await readFile(join(output, ref.url));
  const directory = join(distribution, 'runtime', result.manifest.buildId);
  let exists = false;
  try { exists = (await readFile(join(directory, 'engine.wasm'))).equals(bytes); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!exists) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'engine.wasm'), bytes);
    await representations(join(directory, 'engine.wasm'), bytes);
  }
  const profileNoticeHash = result.manifest.notices.sha256;
  const profileNotices = await loadNotices(join(output, 'notices'), profileNoticeHash);
  try { await loadNotices(join(distribution, 'notices', profileNoticeHash), profileNoticeHash); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeNotices(join(distribution, 'notices', profileNoticeHash), profileNotices); }
  const channel = { ...result.manifest, publishedAt: manifest.publishedAt,
    runtime: { wasm: { ...ref, url: `../../runtime/${result.manifest.buildId}/engine.wasm` } },
    notices: { url: `../../notices/${profileNoticeHash}/index.json`, sha256: profileNoticeHash } };
  await writeFile(join(distribution, 'channels/v1', `${profile}.json`), json(channel));
  profiles.push({ profile, buildId: result.manifest.buildId });
}
console.log(JSON.stringify({ buildId, engineVersion: version, dataVersion: dataset.version, profiles }, null, 2));
