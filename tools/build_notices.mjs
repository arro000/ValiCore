// Assemble a reviewable license bundle from a trusted local build environment.
// No dependency acquisition, compilation, publishing or license selection.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, lstat, realpath, rename, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(message) { throw new Error(message); }
async function absent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail(`Output already exists: ${path}`);
}
async function regular(path) {
  if (!(await lstat(path)).isFile()) fail(`Notice input must be a regular file, not a symlink: ${path}`);
  return readFile(path);
}

export async function collectNotices({ metadata, sysroot, compiler, projectLicense, lockfile }) {
  const files = new Map();
  const packages = [];
  for (const pkg of [...metadata.packages].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'))) {
    if (!pkg.source) {
      if (!metadata.workspace_members?.includes(pkg.id)) fail(`Review path dependency explicitly: ${pkg.name}`);
      continue; // Workspace-authored code is covered separately below.
    }
    if (!/^registry\+/.test(pkg.source)) fail(`Review non-registry dependency explicitly: ${pkg.name}`);
    const registry = new URL(pkg.source.slice('registry+'.length));
    if (registry.username || registry.password) fail('Registry URLs must not embed credentials');
    if (!/^[a-zA-Z0-9_-]+$/.test(pkg.name) || !/^[a-zA-Z0-9.+_-]+$/.test(pkg.version)) fail('Unsafe package identity');
    const directory = dirname(pkg.manifest_path);
    const candidates = (await readdir(directory)).filter(name => /^(LICENSE|COPYING|NOTICE|UNLICENSE)([._-]|$)/i.test(name));
    if (pkg.license_file) {
      const path = resolve(directory, pkg.license_file);
      const local = relative(directory, path);
      if (local === '..' || local.startsWith('../') || local.startsWith('..\\') || isAbsolute(local)) fail('License file escapes package');
      candidates.push(local);
    }
    const notices = [];
    for (const name of [...new Set(candidates)].sort()) {
      const path = join(directory, name);
      if (!(await lstat(path)).isFile()) fail(`Notice input must be a regular file, not a symlink: ${path}`);
      const actual = relative(await realpath(directory), await realpath(path));
      if (actual === '..' || actual.startsWith('../') || actual.startsWith('..\\') || isAbsolute(actual)) fail('License file resolves outside package');
      const bytes = await regular(path);
      const url = `crates/${pkg.name}-${pkg.version}/${name.replaceAll('\\', '/')}`;
      files.set(url, bytes);
      notices.push({ url, sha256: digest(bytes), bytes: bytes.length });
    }
    if (!notices.length || (!pkg.license && !pkg.license_file)) fail(`Missing license evidence: ${pkg.name}@${pkg.version}`);
    packages.push({ name: pkg.name, version: pkg.version, license: pkg.license, source: pkg.source, notices });
  }
  const standard = await regular(join(sysroot, 'share/doc/rust/COPYRIGHT-library.html'));
  files.set('rust/COPYRIGHT-library.html', standard);
  const licenses = join(sysroot, 'share/doc/rust/licenses');
  for (const name of (await readdir(licenses)).sort()) {
    files.set(`rust/licenses/${name}`, await regular(join(licenses, name)));
  }
  files.set('PROJECT-LICENSE', await regular(projectLicense));
  const index = {
    formatVersion: 1, compiler, cargoLockSha256: digest(await regular(lockfile)),
    scope: 'Conservative inventory of all resolved registry crates (including build-only dependencies) and supplied Rust standard-library notices; not a proof of linkage or legal advice.',
    packages,
    files: [...files].map(([url, bytes]) => ({ url, sha256: digest(bytes), bytes: bytes.length })).sort((a, b) => a.url.localeCompare(b.url, 'en')),
  };
  files.set('index.json', Buffer.from(JSON.stringify(index, null, 2) + '\n'));
  return { files, index };
}

export async function writeNoticeBundle(output, bundle) {
  output = resolve(output);
  await absent(output);
  await mkdir(dirname(output), { recursive: true });
  const stage = join(dirname(output), `.${basename(output)}.stage-${randomUUID()}`);
  try {
    await mkdir(stage);
    for (const [url, bytes] of bundle.files) {
      const path = resolve(stage, url);
      const local = relative(stage, path);
      if (!local || local === '..' || local.startsWith('../') || local.startsWith('..\\') || isAbsolute(local)) fail('Unsafe notice output path');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    }
    await absent(output);
    await rename(stage, output);
  } finally { await rm(stage, { recursive: true, force: true }); }
}

export async function collectWorkspaceNotices(source) {
  const root = resolve(source);
  const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
  const metadata = JSON.parse(run('cargo', ['metadata', '--locked', '--offline', '--format-version', '1']));
  return collectNotices({ metadata, compiler: run('rustc', ['--version', '--verbose']), sysroot: run('rustc', ['--print', 'sysroot']), projectLicense: join(root, 'LICENSE'), lockfile: join(root, 'Cargo.lock') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, output, ...extra] = process.argv.slice(2);
  if (!source || !output || extra.length) fail('Usage: node tools/build_notices.mjs <trusted-source-root> <new-output-directory>');
  const bundle = await collectWorkspaceNotices(source);
  await writeNoticeBundle(output, bundle);
  console.log(JSON.stringify({ output: resolve(output), crates: bundle.index.packages.length, files: bundle.files.size, cargoLockSha256: bundle.index.cargoLockSha256 }));
}
