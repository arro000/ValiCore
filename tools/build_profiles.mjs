// Provision a few explicit profiles using the same composer as applications.
// Only the runtime target(s) requested here are archived/copied; no data sync.
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { runtimeSourceIdentity } from './source_identity.mjs';
import { componentRegistry } from './composition.mjs';
import { compose, sha256 } from '../packages/js/tooling/build.js';
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2), flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--output', '--target', '--archive'].includes(args[i]) || !args[i + 1] || flags[args[i]]) throw new Error('Use --output new-directory [--target wasm|native|both] [--archive directory]');
  flags[args[i]] = args[i + 1];
}
if (!flags['--output']) throw new Error('Explicit new profile output directory is required');
const output = resolve(flags['--output']), target = flags['--target'] ?? 'wasm';
if (!['wasm', 'native', 'both'].includes(target)) throw new Error('Invalid target');
try { await lstat(output); throw new Error(`Output already exists: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
await writeFile(join(output, 'registry.json'), JSON.stringify(componentRegistry, null, 2) + '\n', { flag: 'wx' });
async function immutable(path, bytes, compressed = false) {
  await mkdir(resolve(path, '..'), { recursive: true });
  try {
    const existing = await readFile(path);
    if (!(compressed ? gunzipSync(existing).equals(gunzipSync(bytes)) : existing.equals(bytes))) throw new Error(`Immutable archive collision: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(path, bytes, { flag: 'wx' }); }
}
const results = [];
for (const profile of Object.keys(componentRegistry.profiles)) {
  for (const kind of target === 'both' ? ['wasm', 'native'] : [target]) {
    console.log(`[Profiles] Explicit local compilation: ${profile}/${kind}`);
    const result = await compose({ configVersion: 1, profile }, { registry: componentRegistry, mode: 'compile', target: kind, sourceRoot: root,
      output: join(output, profile, kind), cargoTargetDirectory: join(root, 'target/compositions') });
    results.push({ profile, target: kind, ...result });
    if (flags['--archive']) {
      const manifest = result.manifest, ref = manifest.runtime[kind];
      const bytes = await readFile(join(result.output, ref.url));
      if (sha256(bytes) !== ref.sha256) throw new Error('Composed output hash changed before archive');
      const archive = join(resolve(flags['--archive']), 'runtime', ref.sha256);
      await immutable(join(archive, `${ref.url}.gz`), gzipSync(bytes, { level: 9, mtime: 0 }), true);
      await immutable(join(archive, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
    }
  }
}
const source = await runtimeSourceIdentity(root);
const identity = { sourceSha256: source.sha256, profiles: results.map(result => ({ profile: result.profile, target: result.target, sha256: result.manifest.runtime[result.target].sha256 })) };
const setId = sha256(Buffer.from(JSON.stringify(identity)));
const report = { passed: true, verification: 'compiled-info-and-empty-create', source, setId,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()), profiles: results };
await writeFile(join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
if (flags['--archive']) await immutable(join(resolve(flags['--archive']), 'sets', `${setId}.json`), Buffer.from(JSON.stringify(report, null, 2) + '\n'));
console.log(JSON.stringify({ provisioned: true, target, output, profiles: results.length }));
