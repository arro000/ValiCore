import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectNotices, writeNoticeBundle } from '../../../tools/build_notices.mjs';
import { loadNotices, writeNotices, validateNotices } from '../tooling/notices.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'valicore-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const crate = join(root, 'crate');
  const docs = join(root, 'sysroot/share/doc/rust');
  await mkdir(crate, { recursive: true });
  await mkdir(join(docs, 'licenses'), { recursive: true });
  for (const [path, text] of [
    [join(crate, 'LICENSE-MIT'), 'Original MIT copyright and permission'],
    [join(crate, 'LICENSE-UNICODE'), 'Original Unicode permission'],
    [join(docs, 'COPYRIGHT-library.html'), '<html>Original standard-library notices</html>'],
    [join(docs, 'licenses/MIT.txt'), 'Standard-library MIT terms'],
    [join(root, 'LICENSE'), 'Project license'], [join(root, 'Cargo.lock'), 'Fixture lockfile'],
  ]) await writeFile(path, text);
  const pkg = { name: 'unicode-fixture', version: '1.0.0', license: '(MIT OR Apache-2.0) AND Unicode-3.0', source: 'registry+https://example.test/index', manifest_path: join(crate, 'Cargo.toml') };
  const options = { metadata: { packages: [pkg] }, sysroot: join(root, 'sysroot'), compiler: 'fixture compiler', projectLicense: join(root, 'LICENSE'), lockfile: join(root, 'Cargo.lock') };
  return { root, crate, pkg, options };
}

test('notice bundle preserves original texts, alternatives and additional Unicode obligations', async t => {
  const { root, options } = await fixture(t);
  const first = await collectNotices(options), second = await collectNotices(options);
  assert.deepEqual(first, second, 'No clock or local absolute paths in generated inventory');
  assert.equal(first.index.packages[0].license, '(MIT OR Apache-2.0) AND Unicode-3.0');
  assert.equal(first.index.packages[0].notices.length, 2);
  const output = join(root, 'output');
  await writeNoticeBundle(output, first);
  const index = JSON.parse(await readFile(join(output, 'index.json')));
  for (const entry of index.files) {
    const bytes = await readFile(join(output, entry.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
  assert.equal(await readFile(join(output, 'crates/unicode-fixture-1.0.0/LICENSE-UNICODE'), 'utf8'), 'Original Unicode permission');
  await assert.rejects(writeNoticeBundle(output, first), /already exists/);
});

test('missing, escaping and symlink license inputs fail rather than omit notices', async t => {
  const { crate, pkg, options } = await fixture(t);
  pkg.license_file = '../LICENSE';
  await assert.rejects(collectNotices(options), /escapes package/);
  await symlink('..', join(crate, 'linked-parent'));
  pkg.license_file = 'linked-parent/LICENSE';
  await assert.rejects(collectNotices(options), /resolves outside package/);
  delete pkg.license_file;
  await rm(join(crate, 'LICENSE-MIT'));
  await symlink('../LICENSE', join(crate, 'LICENSE-MIT'));
  await assert.rejects(collectNotices(options), /regular file/);
  await rm(join(crate, 'LICENSE-MIT'));
  await rm(join(crate, 'LICENSE-UNICODE'));
  await assert.rejects(collectNotices(options), /Missing license evidence/);
});

test('distributed notice inventories reject tampering, duplicate paths and traversal', async t => {
  const { root, options } = await fixture(t);
  const bundle = await collectNotices(options);
  const output = join(root, 'distributed');
  await writeNotices(output, bundle);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const expected = hash(bundle.files.get('index.json'));
  assert.deepEqual((await loadNotices(output, expected)).index, bundle.index);
  const broken = new Map(bundle.files);
  broken.set('PROJECT-LICENSE', Buffer.from('tampered'));
  assert.throws(() => validateNotices(broken, expected), { code: 'INVALID_NOTICES' });
  for (const entries of [[null], [...bundle.index.files, bundle.index.files[0]],
    [{ url: '../escape', sha256: '0'.repeat(64), bytes: 0 }]]) {
    const bytes = Buffer.from(JSON.stringify({ ...bundle.index, files: entries }));
    await writeFile(join(output, 'index.json'), bytes);
    await assert.rejects(loadNotices(output, hash(bytes)), { code: 'INVALID_NOTICES' });
  }
  await writeFile(join(output, 'index.json'), bundle.files.get('index.json'));
  await rm(join(output, 'PROJECT-LICENSE'));
  await symlink('../LICENSE', join(output, 'PROJECT-LICENSE'));
  await assert.rejects(loadNotices(output, expected), { code: 'INVALID_NOTICES' });
});

test('unsafe output paths and non-registry dependencies cannot silently enter the bundle', async t => {
  const { root, pkg, options } = await fixture(t);
  pkg.source = 'git+https://example.test/source';
  await assert.rejects(collectNotices(options), /non-registry/);
  pkg.source = null;
  await assert.rejects(collectNotices(options), /path dependency/);
  pkg.source = 'registry+https://user:example@example.test/index';
  await assert.rejects(collectNotices(options), /embed credentials/);
  const output = join(root, 'output');
  await assert.rejects(writeNoticeBundle(output, { files: new Map([['../escape', Buffer.from('unsafe')]]) }), /Unsafe notice output path/);
  assert.equal((await readdir(root)).some(name => name.includes('.stage-') || name === 'output' || name === 'escape'), false);
});
