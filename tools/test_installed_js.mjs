// Exercise the actual npm tarball outside the workspace, with no Rust or network.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temporary = await mkdtemp(join(tmpdir(), 'valicore-installed-js-'));
try {
  const packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--workspace', 'packages/js', '--pack-destination', temporary],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const metadata = Array.isArray(packed) ? packed[0] : packed['@arro000/valicore'];
  assert.ok(metadata?.filename && metadata.name === '@arro000/valicore');
  const archive = join(temporary, metadata.filename);
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(npm, ['install', '--no-save', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive],
    { cwd: temporary, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  await writeFile(join(temporary, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { createValiCore } from '@arro000/valicore';
import { createValiCore as fiscalFactory } from '@arro000/valicore/fiscal';
import { createValiCore as italianFactory } from '@arro000/valicore/italian';
const originalFetch = globalThis.fetch;
let remoteAttempts = 0;
globalThis.fetch = () => { remoteAttempts++; throw new Error('Network disabled in installed consumer'); };
const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };
try {
  const engine = await createValiCore();
  try {
    assert.equal(engine.versionInfo().engineVersion, ${JSON.stringify(metadata.version)});
    assert.equal(engine.versionInfo().runtimeApiMajor, 8);
    assert.equal(engine.versionInfo().origin, 'bundled');
    assert.deepEqual(engine.capabilities(), { fiscalIdentity: true, geoHistorical: true });
    assert.equal(engine.encode(person), 'RSSMRA85C15H501R');
    assert.equal(engine.resolvePlace({ name: 'Cattolica', onDate: '1985-03-15' }).candidates[0].province, 'FO');
    assert.equal(engine.resolvePlace({ name: 'Cattolica', onDate: '1992-04-16' }).candidates[0].province, 'RN');
  } finally { engine.dispose(); }
  for (const [factory, components] of [[fiscalFactory, ['fiscal']], [italianFactory, ['fiscal', 'geo']]]) {
    const selected = await factory();
    try {
      assert.deepEqual(selected.versionInfo().components, components);
      assert.equal(selected.versionInfo().dataVersion, null);
      assert.equal(selected.encode(person), 'RSSMRA85C15H501R');
    } finally { selected.dispose(); }
  }
  const bare = await createValiCore({ catalog: false });
  try { assert.equal(bare.validate('RSSMRA85C15H501R').valid, null); }
  finally { bare.dispose(); }
  assert.equal(remoteAttempts, 0);
  console.log(JSON.stringify({ installed: true, version: ${JSON.stringify(metadata.version)}, remoteAttempts }));
} finally { globalThis.fetch = originalFetch; }
`);
  const result = execFileSync(process.execPath, ['consumer.mjs'], { cwd: temporary, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } });
  const report = JSON.parse(result);
  assert.equal(report.installed, true);
  console.log(JSON.stringify({ ...report, archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'), node: process.version }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
