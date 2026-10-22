// Vite integration for precompiled compositions. It reuses the same composer
// as the CLI: no Rust, no browser compilation and no remote build service.
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { compose } from './build.js';

const bundled = fileURLToPath(new URL('../bundled/', import.meta.url));
const VIRTUAL_ID = 'virtual:valicore';
const RESOLVED_ID = '\0virtual:valicore';

function fail(message) { throw Object.assign(new Error(message), { code: 'VALICORE_VITE' }); }

/**
 * @param {object} [options]
 * @param {string} [options.profile] Precompiled profile to distribute.
 * @param {string[]} [options.datasets] Datasets to include and load on request.
 * @param {Partial<Record<string,string>>} [options.resources] Local JSON/gzip paths per dataset.
 * @param {string} [options.base] Output sub-directory for the runtime assets.
 * @param {string} [options.precompiledDirectory] Supplied profile repository.
 */
export default function valicore(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Plugin options must be an object');
  const profile = options.profile ?? 'italian';
  const datasets = options.datasets ?? (options.profile === undefined ? ['geo'] : []);
  const supplied = options.resources ?? {};
  const resources = { get geo() {
    return Object.hasOwn(supplied, 'geo') ? supplied.geo : fileURLToPath(new URL('../bundled/places.json', import.meta.url));
  } };
  const assetBase = (options.base ?? 'valicore').replace(/^\/+|\/+$/g, '');
  const repository = options.precompiledDirectory ? resolve(options.precompiledDirectory) : bundled;
  let bundle;

  return {
    name: 'valicore',
    enforce: 'pre',
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : undefined; },
    async load(id) {
      if (id !== RESOLVED_ID) return;
      if (!bundle) {
        const directory = await mkdtemp(join(tmpdir(), 'valicore-vite-'));
        bundle = { directory, output: join(directory, 'bundle') };
        bundle.result = await compose({ configVersion: 1, profile, datasets },
          { mode: 'precompiled', target: 'wasm', precompiledDirectory: repository, resources, output: bundle.output });
      }
      const { result, output } = bundle;
      const noticeIndex = JSON.parse(await readFile(join(output, result.manifest.notices.url), 'utf8'));
      const files = ['manifest.json', result.manifest.runtime.wasm.url,
        ...Object.values(result.manifest.datasets).map(entry => entry.url),
        result.manifest.notices.url, ...noticeIndex.files.map(entry => `notices/${entry.url}`)];
      for (const file of [...new Set(files)]) {
        this.emitFile({ type: 'asset', fileName: `${assetBase}/${profile}/${file}`, source: await readFile(join(output, file)) });
      }
      return [
        "import { createValiCore as create, ValiCoreEngine, ValiCoreError } from '@arro000/valicore';",
        'export { ValiCoreEngine, ValiCoreError };',
        `const profile = ${JSON.stringify(profile)};`,
        `const datasets = ${JSON.stringify(datasets)};`,
        `const manifestUrl = new URL(${JSON.stringify(`${assetBase}/${profile}/manifest.json`)}, new URL(import.meta.env.BASE_URL, location.href)).href;`,
        'export const createValiCore = (options = {}) => {',
        '  if (!options || typeof options !== "object" || Array.isArray(options)) throw new ValiCoreError("INVALID_ARGUMENT", "Initialization options must be an object");',
        '  if (options.profile !== undefined && options.profile !== profile) throw new ValiCoreError("COMPOSITION_MISMATCH", "This build is bound to its selected profile");',
        '  const selected = options.datasets ?? (options.catalog === undefined ? datasets : options.catalog ? ["geo"] : []);',
        '  return create({ ...options, profile, datasets: selected, distribution: options.distribution ?? { mode: "pinned", manifestUrl } });',
        '};',
      ].join('\n');
    },
    async closeBundle() {
      if (bundle) { await rm(bundle.directory, { recursive: true, force: true }); bundle = undefined; }
    },
  };
}
