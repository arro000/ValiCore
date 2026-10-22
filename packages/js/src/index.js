/**
 * Composition-aware wrapper: transport, manifest verification and types only.
 * Fiscal rules live in the selected Rust runtime. A consumer selects a
 * precompiled profile or an explicit component list, and loads only the
 * datasets it explicitly requests. Nothing else is read or downloaded.
 */
export const DEFAULT_CHANNEL_URL = 'https://arro000.github.io/ValiCore/dist/channels/v1/latest.json';
const RUNTIME_NAME = 'ValiCore';
const PROTOCOL = 1;
const RUNTIME_API_MAJOR = 8;
const LOADER_PROTOCOL = 2;
const DATASETS = ['geo'];
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

export class ValiCoreError extends Error {
  constructor(code, message, field, options) {
    super(message, options);
    this.name = 'ValiCoreError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message) { throw new ValiCoreError(code, message); }

async function sha256(bytes) {
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function httpUrl(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) fail('INVALID_URL', 'Online resources require HTTP or HTTPS URLs');
  return url;
}

async function download(url, timeoutMs, revalidate = false) {
  const response = await fetch(url, { cache: revalidate ? 'no-cache' : 'default', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) fail('DOWNLOAD_FAILED', `HTTP ${response.status} while loading ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function resource(url) {
  if (isNode && url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url); // Buffer already implements Uint8Array; do not copy the dataset.
  }
  return download(url, 20000);
}

async function persistentCache(cacheDirectory, enabled) {
  if (!enabled) return { get: async () => undefined, set: async () => {} };
  if (isNode) {
    const { mkdir, readFile, writeFile, rename } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const directory = cacheDirectory ?? join(homedir(), '.cache', 'valicore', 'v2');
    const keyPath = async key => join(directory, await sha256(encoder.encode(key)));
    return {
      get: async key => { try { return await readFile(await keyPath(key)); } catch { return undefined; } },
      set: async (key, bytes) => {
        await mkdir(directory, { recursive: true });
        const path = await keyPath(key);
        const temp = `${path}.${process.pid}.${globalThis.crypto.randomUUID()}.tmp`;
        await writeFile(temp, bytes);
        await rename(temp, path);
      },
    };
  }
  if (typeof caches === 'undefined') return { get: async () => undefined, set: async () => {} };
  const store = await caches.open('valicore-v2');
  const keyUrl = async key => new URL(`__valicore_cache__/${await sha256(encoder.encode(key))}`, globalThis.location.href).href;
  return {
    get: async key => { const response = await store.match(await keyUrl(key)); return response && new Uint8Array(await response.arrayBuffer()); },
    set: async (key, bytes) => { await store.put(await keyUrl(key), new Response(bytes)); },
  };
}

function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function strings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item)
    && new Set(value).size === value.length;
}
function sameSet(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && new Set(left).size === left.length && left.every(item => right.includes(item));
}
function validRef(value) {
  if (!object(value) || typeof value.url !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) return false;
  if (value.gzip !== undefined && !validRef(value.gzip)) return false;
  return true;
}
function selection(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(id => !DATASETS.includes(id)) || new Set(value).size !== value.length) {
    fail('INVALID_ARGUMENT', `datasets must select only ${DATASETS.join(', ')} without duplicates`);
  }
  return value;
}

/** Resolve one dataset reference, reading only the requested dataset's fields. */
function refFor(manifest, id) {
  const datasets = manifest.datasets;
  if (datasets === undefined) return undefined;
  if (!object(datasets)) fail('INVALID_MANIFEST', 'Dataset descriptors must be an object');
  return datasets[id];
}

/**
 * The runtime manifest declares the actual compiled composition of this one
 * artifact, the schemas of its compiled providers and the data resources that
 * this release carries. Runtime API version 8 / loader protocol 2.
 */
function verifyManifest(manifest, requested, expected) {
  if (!object(manifest)) fail('INVALID_MANIFEST', 'The release manifest must be a JSON object');
  if (manifest.runtimeName !== RUNTIME_NAME || manifest.manifestVersion !== LOADER_PROTOCOL
    || manifest.runtimeApiMajor !== RUNTIME_API_MAJOR || manifest.loaderProtocol !== LOADER_PROTOCOL) {
    fail('INCOMPATIBLE_MANIFEST', 'This release is incompatible with the installed wrapper');
  }
  if (!strings(manifest.components) || !strings(manifest.modules) || !strings(manifest.operations)
    || !object(manifest.schemas) || Object.values(manifest.schemas).some(value => !Number.isInteger(value))) {
    fail('INVALID_MANIFEST', 'The release manifest must declare its compiled components, modules, operations and schemas');
  }
  if (typeof manifest.buildId !== 'string' || !manifest.buildId) {
    fail('INVALID_MANIFEST', 'The release manifest must declare a build identity');
  }
  if (expected !== undefined && !sameSet(manifest.components, expected)) {
    fail('COMPOSITION_MISMATCH', 'The selected components do not match this release composition');
  }
  if (manifest.selection !== undefined && (!object(manifest.selection) || manifest.selection.configVersion !== 1
    || !sameSet(manifest.selection.components, manifest.components))) {
    fail('INVALID_MANIFEST', 'The release manifest selection is inconsistent');
  }
  if (!object(manifest.runtime) || !validRef(manifest.runtime.wasm)) {
    fail('INVALID_MANIFEST', 'The release manifest must reference a WASM runtime');
  }
  const refs = {};
  for (const id of requested) {
    const ref = refFor(manifest, id);
    if (ref === undefined) {
      fail('DATASET_UNAVAILABLE', `The selected runtime does not carry the ${id} dataset; select a release that includes it`);
    }
    if (!validRef(ref) || typeof ref.version !== 'string' || !ref.version || !Number.isInteger(ref.schemaVersion)
      || ref.schemaVersion !== manifest.schemas[id]) {
      fail('INVALID_MANIFEST', `Dataset reference ${id} is incomplete or not a compiled provider`);
    }
    refs[id] = ref;
  }
  return refs;
}

async function decompressGzip(bytes) {
  try {
    if (isNode) {
      const { gunzip } = await import('node:zlib');
      return await new Promise((resolve, reject) => gunzip(bytes, (error, result) => error ? reject(error) : resolve(result)));
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (cause) {
    throw new ValiCoreError('INVALID_COMPRESSION', 'Unable to decompress the gzip resource', undefined, { cause });
  }
}

async function checkedResource(ref, manifestUrl, cache, timeoutMs, cacheOnly = false) {
  const url = httpUrl(ref.url, manifestUrl);
  const key = `resource:${ref.sha256}`;
  let bytes = await cache.get(key);
  if (bytes && await sha256(bytes) !== ref.sha256) bytes = undefined;
  if (!bytes) {
    if (cacheOnly) fail('INCOMPLETE_CACHE', 'No complete compatible release is available in the cache');
    if (ref.gzip && (isNode || typeof DecompressionStream === 'function')) {
      const compressed = await download(httpUrl(ref.gzip.url, manifestUrl), timeoutMs);
      if (await sha256(compressed) !== ref.gzip.sha256) fail('HASH_MISMATCH', 'Compressed resource hash does not match');
      bytes = await decompressGzip(compressed);
    } else bytes = await download(url, timeoutMs);
    if (await sha256(bytes) !== ref.sha256) fail('HASH_MISMATCH', `Resource hash does not match: ${url}`);
    await cache.set(key, bytes);
  }
  return bytes;
}

async function profileComponents(profile, expected) {
  if (profile === undefined) return expected;
  const registry = JSON.parse(decoder.decode(await resource(new URL('../bundled/registry.json', import.meta.url))));
  const components = Object.hasOwn(registry.profiles, profile) ? registry.profiles[profile] : undefined;
  if (!strings(components)) fail('INVALID_ARGUMENT', 'Unknown precompiled profile');
  if (expected !== undefined && !sameSet(components, expected)) fail('COMPOSITION_MISMATCH', 'Explicit components differ from the selected profile');
  return components;
}

async function online(distribution, requested, expected, profile) {
  const defaultChannel = profile === undefined ? DEFAULT_CHANNEL_URL : new URL(`${profile}.json`, DEFAULT_CHANNEL_URL).href;
  const channelUrl = httpUrl(distribution.channelUrl ?? defaultChannel).href;
  const timeoutMs = distribution.timeoutMs ?? 20000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) fail('INVALID_ARGUMENT', 'timeoutMs must be a positive integer');
  let cache;
  try { cache = await persistentCache(distribution.cacheDirectory, distribution.cache !== false); }
  catch { cache = await persistentCache(undefined, false); }
  const rawCache = cache;
  cache = {
    get: async key => { try { return await rawCache.get(key); } catch { return undefined; } },
    set: async (key, bytes) => { try { await rawCache.set(key, bytes); } catch { /* Storage is optional. */ } },
  };
  // A runtime-only release must never be promoted as a complete release, and a
  // release loaded with fewer datasets is a different cache key.
  const manifestKey = `manifest:${[...requested].sort().join(',')}:${channelUrl}`;
  let remoteError;
  try {
    const manifestBytes = await download(channelUrl, timeoutMs, true);
    const manifest = JSON.parse(decoder.decode(manifestBytes));
    const refs = verifyManifest(manifest, requested, expected);
    const wasm = await checkedResource(manifest.runtime.wasm, channelUrl, cache, timeoutMs);
    const datasets = await loadRemote(refs, channelUrl, cache, timeoutMs);
    const result = await initialize(wasm, manifest, 'remote', datasets);
    await cache.set(manifestKey, manifestBytes); // Promote only a fully initialized release.
    return result;
  } catch (error) { remoteError = error; }
  if (distribution.fallback === false) throw remoteError;
  try {
    const manifestBytes = await cache.get(manifestKey);
    if (!manifestBytes) fail('EMPTY_CACHE', 'No release has been cached');
    const manifest = JSON.parse(decoder.decode(manifestBytes));
    const refs = verifyManifest(manifest, requested, expected);
    const wasm = await checkedResource(manifest.runtime.wasm, channelUrl, cache, timeoutMs, true);
    const datasets = await loadRemote(refs, channelUrl, cache, timeoutMs, true);
    return await initialize(wasm, manifest, 'cache', datasets, remoteError.message);
  } catch { /* Try the packaged release when available. */ }
  try { return await bundled(profile, requested, remoteError.message, expected); }
  catch {
    throw new ValiCoreError('INITIALIZATION_FAILED', `Online initialization failed and no local release is available: ${remoteError.message}`, undefined, { cause: remoteError });
  }
}

async function loadRemote(refs, manifestUrl, cache, timeoutMs, cacheOnly = false) {
  const datasets = {};
  for (const [id, ref] of Object.entries(refs)) {
    const bytes = await checkedResource(ref, manifestUrl, cache, timeoutMs, cacheOnly);
    datasets[id] = { bytes, ref };
  }
  return datasets;
}

async function bundled(profile, requested, fallbackReason, expected) {
  const manifestUrl = profile
    ? new URL(`../bundled/${profile}/wasm/manifest.json`, import.meta.url)
    : new URL('../bundled/manifest.json', import.meta.url);
  let manifestBytes;
  try { manifestBytes = await resource(manifestUrl); }
  catch (error) { if (!profile) throw error; fail('PRECOMPILED_UNAVAILABLE', `The packaged ${profile} profile is not supplied: ${error.message}`); }
  const manifest = JSON.parse(decoder.decode(manifestBytes));
  const refs = verifyManifest(manifest, requested, expected);
  const wasm = await resource(new URL(manifest.runtime.wasm.url, manifestUrl));
  if (await sha256(wasm) !== manifest.runtime.wasm.sha256) fail('HASH_MISMATCH', 'Bundled runtime does not match its manifest');
  const datasets = {};
  for (const [id, ref] of Object.entries(refs)) {
    const bytes = await resource(new URL(ref.url, manifestUrl));
    if (await sha256(bytes) !== ref.sha256) fail('HASH_MISMATCH', `Bundled ${id} dataset does not match its manifest`);
    datasets[id] = { bytes, ref };
  }
  return initialize(wasm, manifest, 'bundled', datasets, fallbackReason);
}

async function custom(distribution, requested, expected) {
  const manifest = distribution.manifest;
  const refs = verifyManifest(manifest, requested, expected);
  const wasm = distribution.wasm instanceof Uint8Array ? distribution.wasm : new Uint8Array(distribution.wasm);
  if (await sha256(wasm) !== manifest.runtime.wasm.sha256) fail('HASH_MISMATCH', 'Custom WASM does not match the manifest');
  if (Object.keys(distribution).some(key => !['mode', 'wasm', 'manifest', 'datasets'].includes(key)))
    fail('INVALID_ARGUMENT', 'Custom mode accepts only wasm, manifest and datasets');
  const supplied = requested.length ? distribution.datasets ?? {} : {};
  if (!object(supplied) || Object.keys(supplied).some(id => !DATASETS.includes(id))) {
    fail('INVALID_ARGUMENT', 'Custom datasets must be an object keyed by dataset identifier');
  }
  for (const id of Object.keys(supplied)) if (!requested.includes(id)) {
    fail('INVALID_ARGUMENT', `Custom mode supplied dataset ${id} that was not requested`);
  }
  const datasets = {};
  for (const id of requested) {
    const value = supplied[id];
    if (value === undefined) fail('DATASET_REQUIRED', `Custom mode requires the ${id} dataset as an explicit input`);
    const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : undefined;
    if (bytes && await sha256(bytes) !== refs[id].sha256) fail('HASH_MISMATCH', `Custom ${id} bytes do not match their manifest`);
    datasets[id] = { bytes, value: bytes ? undefined : value, ref: refs[id] };
  }
  return initialize(wasm, manifest, 'custom', datasets);
}

async function initialize(wasmBytes, manifest, origin, datasets, fallbackReason) {
  for (const [id, entry] of Object.entries(datasets)) {
    const ref = entry.ref;
    if (ref && object(entry.value) && (entry.value.version !== ref.version || entry.value.schemaVersion !== ref.schemaVersion)) {
      fail('INCOMPATIBLE_DATASET', `${id} dataset identity does not match the release manifest`);
    }
  }
  const geo = datasets.geo;
  const geoBytes = geo?.bytes;
  const geoValue = geo?.value;
  let instance;
  try { ({ instance } = await WebAssembly.instantiate(wasmBytes, {})); }
  catch (error) { throw error; }
  const exports = instance.exports;
  if (!(exports.memory instanceof WebAssembly.Memory)
    || ['valicore_alloc', 'valicore_dealloc', 'valicore_invoke', 'valicore_create_json_owned'].some(name => typeof exports[name] !== 'function')) {
    fail('INCOMPATIBLE_RUNTIME', 'Required runtime ABI exports are missing');
  }
  const callBytes = (input, createContext) => {
    if (input.length > 0xffffffff || createContext?.length > 0xffffffff)
      fail('INPUT_TOO_LARGE', 'Input/context exceeds the ABI buffer limit');
    const pointer = exports.valicore_alloc(input.length);
    let contextPointer = 0, outputPointer = 0, outputLength = 0, inputTransferred = false;
    try {
      new Uint8Array(exports.memory.buffer, pointer, input.length).set(input);
      let packed;
      if (createContext) {
        contextPointer = exports.valicore_alloc(createContext.length);
        new Uint8Array(exports.memory.buffer, contextPointer, createContext.length).set(createContext);
        inputTransferred = true;
        packed = BigInt.asUintN(64, exports.valicore_create_json_owned(pointer, input.length, contextPointer, createContext.length));
      } else packed = BigInt.asUintN(64, exports.valicore_invoke(pointer, input.length));
      outputPointer = Number(packed >> 32n);
      outputLength = Number(packed & 0xffffffffn);
      const envelope = JSON.parse(decoder.decode(new Uint8Array(exports.memory.buffer, outputPointer, outputLength)));
      if (!envelope.ok) {
        if (createContext && envelope.error.code === 'INVALID_JSON') throw new SyntaxError(envelope.error.message);
        throw new ValiCoreError(envelope.error.code, envelope.error.message, envelope.error.field);
      }
      return envelope.value;
    } finally {
      if (outputLength) exports.valicore_dealloc(outputPointer, outputLength);
      if (createContext) exports.valicore_dealloc(contextPointer, createContext.length);
      if (!inputTransferred) exports.valicore_dealloc(pointer, input.length);
    }
  };
  const jsonBytes = request => encoder.encode(JSON.stringify(request, (_, value) => {
      // JSON would silently convert NaN/Infinity to null, which can turn an
      // invalid optional filter into an omitted constraint at the ABI boundary.
      if (typeof value === 'number' && !Number.isFinite(value)) fail('INVALID_ARGUMENT', 'Arguments must contain finite JSON numbers');
      return value;
    }));
  const invoke = request => callBytes(jsonBytes({ ...request, protocol: PROTOCOL }));
  const info = invoke({ op: 'info' });
  if (info.runtimeName !== RUNTIME_NAME || info.runtimeName !== manifest.runtimeName
    || info.runtimeApiMajor !== manifest.runtimeApiMajor || info.loaderProtocol !== manifest.loaderProtocol
    || info.engineVersion !== manifest.engineVersion
    || !sameSet(info.components, manifest.components) || !sameSet(info.modules, manifest.modules)
    || !sameSet(info.operations, manifest.operations)
    || JSON.stringify(Object.fromEntries(Object.entries(info.schemas).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(manifest.schemas).sort()))) {
    fail('INCOMPATIBLE_RUNTIME', 'Runtime identity does not match the release manifest');
  }
  let created;
  if (geoBytes) {
    // Raw WASM/Node fast path; the same JSON semantics are preserved by
    // retrying through the JSON dispatcher for malformed or ambiguous input.
    try {
      created = callBytes(geoBytes, jsonBytes({ dataVersion: geo.ref.version }));
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== 'INVALID_ARGUMENT') throw error;
      const parsed = JSON.parse(decoder.decode(geoBytes));
      if (parsed.schemaVersion !== geo.ref.schemaVersion || parsed.version !== geo.ref.version) {
        fail('INCOMPATIBLE_DATASET', 'Dataset version or schema does not match the release manifest');
      }
      const handle = invoke({ op: 'create', dataset: parsed });
      created = { handle, dataVersion: parsed.version, sources: parsed.sources };
    }
  } else {
    const handle = invoke({ op: 'create', ...(geoValue !== undefined ? { dataset: geoValue } : {}) });
    created = { handle, dataVersion: geoValue?.version ?? null, sources: geoValue?.sources ?? {} };
  }
  const handle = typeof created === 'number' ? created : created.handle;
  try {
    const engine = new ValiCoreEngine(invoke, handle, {
      ...info, buildId: manifest.buildId, origin,
      components: [...manifest.components], modules: [...manifest.modules], operations: [...manifest.operations],
      schemas: { ...manifest.schemas },
      dataVersion: created.dataVersion ?? null,
      sourceDates: Object.fromEntries(Object.entries(object(created.sources) ? created.sources : {})
        .map(([id, source]) => [id, object(source) && typeof source.referenceDate === 'string' ? source.referenceDate : null])),
      ...(fallbackReason ? { fallbackReason } : {}),
    });
    // Release input references after Rust owns the independent snapshots.
    for (const entry of Object.values(datasets)) { entry.bytes = entry.value = undefined; }
    return engine;
  } catch (error) {
    try { invoke({ op: 'dispose', handle }); } catch { /* Preserve the original initialization error. */ }
    throw error;
  }
}

export class ValiCoreEngine {
  #invoke;
  #handle;
  #versions;
  #disposed = false;
  constructor(invoke, handle, versions) { this.#invoke = invoke; this.#handle = handle; this.#versions = versions; }
  #call(op, args = {}) {
    if (this.#disposed) fail('ENGINE_DISPOSED', 'This engine has been disposed');
    return this.#invoke({ ...args, op, handle: this.#handle });
  }
  encode(person) { return this.#call('encode', { person }); }
  validate(code, options = {}) { return this.#call('validate', { code, options }); }
  isValid(code, options = {}) { return this.validate(code, options).valid === true; }
  decode(code, options = {}) { return this.#call('decode', { code, options }); }
  birthplaceHistory(code, options = {}) { return this.#call('birthplaceHistory', { code, options }); }
  matchesPerson(code, person) { return this.#call('matchesPerson', { code, person }); }
  validateItalianVat(vat) { return this.#call('validateItalianVat', { vat }); }
  validateItalianRea(rea) { return this.#call('validateItalianRea', { rea }); }
  checksum(body) { return this.#call('checksum', { body }); }
  numericChecksum(body) { return this.#call('numericChecksum', { body }); }
  nameCode(name) { return this.#call('nameCode', { name }); }
  surnameCode(surname) { return this.#call('surnameCode', { surname }); }
  toBase(code) { return this.#call('toBase', { code }); }
  toOmocode(code, mask) { return this.#call('toOmocode', { code, mask }); }
  omocodiaMask(code) { return this.#call('omocodiaMask', { code }); }
  isOmocode(code) { return this.omocodiaMask(code) !== 0; }
  omocodes(code, { includeBase = true } = {}) { return this.#call('omocodes', { code, includeBase }); }
  sameBase(left, right) { return this.#call('sameBase', { left, right }); }
  searchPlaces(query, options = {}) { return this.#call('searchPlaces', { query, options }); }
  listProvinces(options = {}) { return this.#call('listProvinces', { options }); }
  resolvePlace(query) { return this.#call('resolvePlace', { query }); }
  datasetInfo() { return this.#call('datasetInfo'); }
  capabilities() { return this.#call('capabilities'); }
  versionInfo() { return structuredClone(this.#versions); }
  dispose() { if (!this.#disposed) { this.#call('dispose'); this.#disposed = true; } }
}

/** Initialization is asynchronous; all operations on the engine are synchronous. */
export async function createValiCore(options = {}) {
  if (!object(options) || Object.keys(options).some(key => !['profile', 'components', 'datasets', 'catalog', 'distribution'].includes(key)))
    fail('INVALID_ARGUMENT', 'Initialization options must contain only profile, components, datasets and distribution');
  if (options.profile !== undefined && (typeof options.profile !== 'string' || !options.profile))
    fail('INVALID_ARGUMENT', 'profile must be a non-empty string');
  if (options.components !== undefined && !strings(options.components))
    fail('INVALID_ARGUMENT', 'components must be a non-empty list of component identifiers');
  for (const flag of ['catalog']) if (options[flag] !== undefined && typeof options[flag] !== 'boolean')
    fail('INVALID_ARGUMENT', `${flag} must be a boolean`);
  const explicit = selection(options.datasets);
  let requested;
  if (explicit !== undefined) {
    if (options.catalog !== undefined && options.catalog !== explicit.includes('geo'))
      fail('INVALID_ARGUMENT', 'catalog and datasets selections contradict each other');
    requested = [...explicit];
  } else {
    // The complete package includes geography; precompiled profiles carry only
    // runtimes unless the caller explicitly selects a dataset.
    requested = [];
    if (options.catalog === true || (options.catalog === undefined && options.profile === undefined)) requested.push('geo');
  }
  const distribution = options.distribution === undefined ? { mode: 'bundled' } : options.distribution;
  if (!object(distribution)) fail('INVALID_ARGUMENT', 'distribution must be an object');
  if (!['bundled', 'online', 'pinned', 'custom'].includes(distribution.mode)) fail('INVALID_ARGUMENT', 'Unknown distribution mode');
  const expected = await profileComponents(options.profile, options.components);
  switch (distribution.mode) {
    case 'bundled': return bundled(options.profile, requested, undefined, expected);
    case 'online': return online(distribution, requested, expected, options.profile);
    case 'pinned': {
      if (!distribution.manifestUrl) fail('INVALID_ARGUMENT', 'Pinned mode requires manifestUrl');
      return online({ ...distribution, channelUrl: distribution.manifestUrl, fallback: false }, requested, expected, options.profile);
    }
    case 'custom': {
      if (!distribution.wasm || !distribution.manifest) fail('INVALID_ARGUMENT', 'Custom mode requires wasm and manifest');
      return custom(distribution, requested, expected);
    }
    default: fail('INVALID_ARGUMENT', 'Unknown distribution mode');
  }
}
