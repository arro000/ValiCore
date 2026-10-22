// One exact runtime per application. Compilation is explicit, local and offline.
import { readFile, writeFile, mkdir, rm, rename, lstat, mkdtemp } from 'node:fs/promises';
import { dirname, basename, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNotices, writeNotices } from './notices.js';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { normalizeComposition } from './config.js';
import { wasmTransport } from './abi.js';
const bundled = fileURLToPath(new URL('../bundled/', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const serialize = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
async function absent(path) {
  try { await lstat(path); fail('OUTPUT_EXISTS', `Output already exists: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    let stdout = '', stderr = '';
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => reject(Object.assign(new Error(`${command} is required and must already be installed: ${error.message}`), { code: 'TOOLCHAIN_REQUIRED' })));
    child.on('close', code => code === 0 ? resolveRun(stdout) : reject(Object.assign(new Error(`${command} failed (${code}). No toolchain or dependency acquisition is performed.\n${stderr}\n${stdout}`), { code: 'BUILD_FAILED' })));
  });
}
export function verifyRuntimeInfo(info, composition) {
  if (!info || info.runtimeName !== 'ValiCore' || typeof info.engineVersion !== 'string') fail('INCOMPATIBLE_RUNTIME', 'Missing runtime identity');
  for (const key of ['runtimeApiMajor', 'loaderProtocol']) if (info[key] !== composition[key]) fail('INCOMPATIBLE_RUNTIME', `Runtime ${key} differs from the registry`);
  for (const key of ['components', 'modules', 'operations']) {
    if (!Array.isArray(info[key]) || info[key].length !== composition[key].length || new Set(info[key]).size !== info[key].length || info[key].some(id => !composition[key].includes(id))) {
      fail('COMPOSITION_MISMATCH', `Runtime ${key} is not the exact requested composition`);
    }
  }
  const schemas = info.schemas;
  if (!schemas || Array.isArray(schemas) || Object.keys(schemas).length !== Object.keys(composition.schemas).length || Object.entries(composition.schemas).some(([key, value]) => schemas[key] !== value)) {
    fail('COMPOSITION_MISMATCH', 'Runtime provider schemas differ from the exact composition');
  }
}
async function compile(composition, target, sourceRoot, temporary, cacheDirectory) {
  if (typeof sourceRoot !== 'string' || !sourceRoot) fail('SOURCE_REQUIRED', 'Explicit compilation requires sourceRoot pointing to the trusted ValiCore workspace');
  sourceRoot = resolve(sourceRoot);
  await readFile(join(sourceRoot, 'Cargo.lock')); // No generated workspace or hidden source download.
  const targetDirectory = cacheDirectory ? resolve(cacheDirectory) : join(temporary, 'target');
  const args = ['build', '--offline', '--locked', '--release', '--manifest-path', join(sourceRoot, 'Cargo.toml'), '-p', 'valicore-abi', '--no-default-features', '--features', composition.components.join(','), '--target-dir', targetDirectory];
  if (target === 'wasm') args.push('--target', 'wasm32-unknown-unknown');
  else args.push('--lib', '--example', 'composition_info');
  await run('cargo', args, sourceRoot);
  const compiler = (await run('rustc', ['--version', '--verbose'], sourceRoot)).trim();
  if (target === 'wasm') return { bytes: await readFile(join(targetDirectory, 'wasm32-unknown-unknown/release/valicore_abi.wasm')), compiler };
  const filename = process.platform === 'win32' ? 'valicore_abi.dll' : process.platform === 'darwin' ? 'libvalicore_abi.dylib' : 'libvalicore_abi.so';
  const probe = join(targetDirectory, 'release/examples', `composition_info${process.platform === 'win32' ? '.exe' : ''}`);
  const result = JSON.parse(await run(probe, [], sourceRoot));
  if (!result.ok) fail('INCOMPATIBLE_RUNTIME', 'Native host probe failed');
  return { bytes: await readFile(join(targetDirectory, 'release', filename)), info: result.value, filename, probe, compiler };
}
async function precompiled(composition, target, directory) {
  if (!composition.profile) fail('CUSTOM_BUILD_REQUIRED', 'No exact precompiled profile exists. Choose explicit compile mode with Rust and the WASM target; no superset fallback is allowed');
  const path = join(directory, composition.profile, target, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { fail('PRECOMPILED_UNAVAILABLE', `The exact ${composition.profile}/${target} profile is not supplied: ${error.message}. Use a supplied profile directory or explicit compile mode`); }
  verifyRuntimeInfo(manifest, composition);
  if (manifest.manifestVersion !== 2 || manifest.runtimeCompositionHash !== composition.runtimeCompositionHash) fail('COMPOSITION_MISMATCH', 'Precompiled manifest composition identity differs');
  const ref = manifest.runtime?.[target];
  if (!ref || typeof ref.url !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256)) fail('INVALID_MANIFEST', 'Precompiled runtime reference is invalid');
  const filename = basename(ref.url);
  if (ref.url !== filename) fail('INVALID_MANIFEST', 'Precompiled runtime URL must be a local filename');
  if (target === 'native' && (ref.platform !== process.platform || ref.architecture !== process.arch)) fail('INCOMPATIBLE_RUNTIME', 'Native precompiled profile belongs to another platform/architecture');
  const bytes = await readFile(join(dirname(path), filename));
  if (sha256(bytes) !== ref.sha256) fail('HASH_MISMATCH', 'Precompiled runtime hash differs');
  if (manifest.notices?.url !== 'notices/index.json' || !/^[a-f0-9]{64}$/.test(manifest.notices.sha256)) fail('INVALID_NOTICES', 'Precompiled runtime must carry a hashed local notice inventory');
  const notices = await loadNotices(join(dirname(path), 'notices'), manifest.notices.sha256);
  return { bytes, info: manifest, filename, notices };
}
async function dataset(path, id, schema) {
  if (typeof path !== 'string' || !path) fail('DATASET_REQUIRED', `Selected dataset ${id} requires an explicit local JSON/gzip path. No download or live source refresh is performed`);
  let bytes = await readFile(resolve(path));
  if (extname(path) === '.gz' || (bytes[0] === 0x1f && bytes[1] === 0x8b)) bytes = gunzipSync(bytes);
  const value = JSON.parse(bytes);
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== schema || typeof value.version !== 'string' || !value.version) {
    fail('INCOMPATIBLE_DATASET', `${id} requires a dataset object with the compiled schema and explicit version`);
  }
  const provenance = {};
  for (const field of ['sources', 'coverage', 'source', 'edition', 'validFrom', 'operationalFrom', 'administrativeStatusCounts', 'checksumDiscrepancies']) {
    if (Object.hasOwn(value, field)) provenance[field] = value[field];
  }
  return { bytes, value, descriptor: { version: value.version, schemaVersion: value.schemaVersion, url: `${id}.json`, sha256: sha256(bytes), bytes: bytes.length, provenance } };
}

export async function compose(config, options = {}) {
  const registry = options.registry ?? JSON.parse(await readFile(join(bundled, 'registry.json'), 'utf8'));
  const composition = normalizeComposition(config, registry);
  const target = options.target ?? 'wasm', mode = options.mode ?? 'precompiled';
  if (!['wasm', 'native'].includes(target) || !['precompiled', 'compile'].includes(mode)) fail('INVALID_ARGUMENT', 'target must be wasm/native; mode must be precompiled/compile');
  if (typeof options.output !== 'string' || !options.output) fail('INVALID_ARGUMENT', 'An explicit new output directory is required');
  const output = resolve(options.output);
  await absent(output);
  await mkdir(dirname(output), { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), 'valicore-compose-'));
  const stage = join(dirname(output), `.${basename(output)}.stage-${randomUUID()}`);
  try {
    const runtime = mode === 'compile'
      ? await compile(composition, target, options.sourceRoot, temporary, options.cargoTargetDirectory)
      : await precompiled(composition, target, resolve(options.precompiledDirectory ?? bundled));
    if (mode === 'compile') {
      const directory = join(temporary, 'notices');
      await run(process.execPath, [join(resolve(options.sourceRoot), 'tools/build_notices.mjs'), resolve(options.sourceRoot), directory], options.sourceRoot);
      runtime.notices = await loadNotices(directory, sha256(await readFile(join(directory, 'index.json'))));
    }
    let transport;
    if (target === 'wasm') { transport = await wasmTransport(runtime.bytes); runtime.info = transport.info; runtime.filename = 'engine.wasm'; }
    verifyRuntimeInfo(runtime.info, composition);
    const loaded = {};
    // Deliberately never enumerate/read disabled resource payloads or getters.
    for (const id of composition.datasets) loaded[id] = await dataset(options.resources?.[id], id, composition.schemas[id]);
    const additional = {};
    for (const [id, resource] of Object.entries(loaded)) if (id !== 'geo') additional[registry.datasets[id].requestField] = resource.value;
    if (transport) {
      const handle = transport.create(loaded.geo?.bytes, loaded.geo?.value.version, additional);
      transport.invoke({ op: 'dispose', handle });
    } else if (runtime.probe) {
      const request = { protocol: 1, op: 'create', ...additional, ...(loaded.geo ? { dataset: loaded.geo.value } : {}) };
      const path = join(temporary, 'request.json'); await writeFile(path, serialize(request));
      await run(runtime.probe, [path], options.sourceRoot);
    }
    const info = runtime.info;
    const hash = sha256(runtime.bytes);
    const manifest = {
      manifestVersion: 2, runtimeName: info.runtimeName, engineVersion: info.engineVersion,
      runtimeApiMajor: info.runtimeApiMajor, loaderProtocol: info.loaderProtocol,
      components: composition.components, modules: composition.modules, operations: composition.operations, schemas: composition.schemas,
      buildId: hash.slice(0, 20), runtimeCompositionHash: composition.runtimeCompositionHash, compositionHash: composition.compositionHash,
      selection: { configVersion: 1, components: composition.components, datasets: composition.datasets },
      runtime: { [target]: { url: runtime.filename, sha256: hash, bytes: runtime.bytes.length,
        ...(target === 'native' ? { platform: process.platform, architecture: process.arch } : {}) } },
      datasets: Object.fromEntries(Object.entries(loaded).map(([id, resource]) => [id, resource.descriptor])),
      notices: { url: 'notices/index.json', sha256: sha256(runtime.notices.files.get('index.json')) },
    };
    await mkdir(stage);
    await writeNotices(join(stage, 'notices'), runtime.notices);
    await writeFile(join(stage, runtime.filename), runtime.bytes, { flag: 'wx' });
    for (const resource of Object.values(loaded)) await writeFile(join(stage, resource.descriptor.url), resource.bytes, { flag: 'wx' });
    await writeFile(join(stage, 'manifest.json'), serialize(manifest), { flag: 'wx' });
    await absent(output); await rename(stage, output);
    return { output, manifest, build: { mode, target, validation: transport || runtime.probe ? 'rust-create' : 'manifest-hash-schema', ...(runtime.compiler ? { compiler: runtime.compiler } : {}) } };
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}
