// Hash-verified license resources. These are distribution metadata, not domain rules.
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(message) { throw Object.assign(new Error(message), { code: 'INVALID_NOTICES' }); }
function safe(url) {
  return typeof url === 'string' && !/[\\:#?\0]/.test(url) && !isAbsolute(url)
    && url.split('/').every(part => part && part !== '.' && part !== '..');
}
export function validateNotices(files, expectedHash) {
  const bytes = files.get('index.json');
  if (!bytes || hash(bytes) !== expectedHash) fail('Notice index hash differs');
  let index;
  try { index = JSON.parse(bytes); } catch { fail('Notice index is not JSON'); }
  if (index?.formatVersion !== 1 || !Array.isArray(index.files) || !index.files.length) fail('Invalid notice inventory');
  const names = new Set(['index.json']);
  for (const entry of index.files) {
    if (!entry || !safe(entry.url) || names.has(entry.url) || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail('Invalid or duplicate notice resource');
    const value = files.get(entry.url);
    if (!value || value.length !== entry.bytes || hash(value) !== entry.sha256) fail('Notice resource hash/length differs');
    names.add(entry.url);
  }
  if (!names.has('PROJECT-LICENSE') || !names.has('rust/COPYRIGHT-library.html') || files.size !== names.size) fail('Incomplete or unmanifested notices');
  return index;
}
export async function loadNotices(directory, expectedHash) {
  async function regular(url) {
    if (!safe(url)) fail('Unsafe notice path');
    const path = resolve(directory, url);
    if (!(await lstat(path)).isFile()) fail('Notice resource must not be a symlink');
    const actual = relative(await realpath(directory), await realpath(path));
    if (actual === '..' || actual.startsWith('../') || actual.startsWith('..\\') || isAbsolute(actual)) fail('Notice path escapes its directory');
    return readFile(path);
  }
  const bytes = await regular('index.json');
  if (hash(bytes) !== expectedHash) fail('Notice index hash differs');
  let index;
  try { index = JSON.parse(bytes); } catch { fail('Notice index is not JSON'); }
  if (!Array.isArray(index?.files)) fail('Missing notice inventory');
  const files = new Map([['index.json', bytes]]);
  for (const entry of index.files) {
    if (!entry || !safe(entry.url)) fail('Unsafe notice inventory entry');
    if (files.has(entry.url)) fail('Duplicate notice inventory entry');
    files.set(entry.url, await regular(entry.url));
  }
  validateNotices(files, expectedHash);
  return { files, index };
}
export async function writeNotices(directory, bundle) {
  validateNotices(bundle.files, hash(bundle.files.get('index.json') ?? Buffer.alloc(0)));
  await mkdir(directory);
  for (const [url, bytes] of bundle.files) {
    const path = join(directory, url);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
