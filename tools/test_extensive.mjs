import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const steps = [
  ['Coordinated release versions', 'python3', ['tools/test_release_versions.py']],
  ['Release artifact assembly contract', 'python3', ['-m', 'unittest', 'discover', '-s', 'tools/tests', '-p', 'test_release_workflow.py', '-v']],
  ['Repository documentation links', 'python3', ['tools/test_documentation.py']],
  ['Geographic permission evidence', 'python3', ['-m', 'unittest', 'discover', '-s', 'tools/tests', '-p', 'test_license_evidence.py', '-v']],
  ['Reference corpus reproducibility', 'python3', ['tools/tests/generate_vectors.py', '--check']],
  ['Italian VAT corpus reproducibility', 'python3', ['tools/tests/generate_vat_vectors.py', '--check']],
  ['Italian REA corpus reproducibility', 'python3', ['tools/tests/generate_rea_vectors.py', '--check']],
  ['Birthplace history corpus reproducibility', 'python3', ['tools/tests/generate_birthplace_history_vectors.py', '--check']],
  ['Rust formatting', 'cargo', ['fmt', '--all', '--check']],
  ['Rust linting', 'cargo', ['clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']],
  ['Rust core and ABI matrices', 'cargo', ['test', '--workspace', '--locked']],
  ['Composition fiscal-only ABI availability', 'cargo', ['test', '--locked', '-p', 'valicore-abi', '--no-default-features', '--features', 'fiscal', '--test', 'composition']],
  ['Composition geo-only ABI availability', 'cargo', ['test', '--locked', '-p', 'valicore-abi', '--no-default-features', '--features', 'geo', '--test', 'composition']],
  ['Importer matrices', 'python3', ['-m', 'unittest', 'discover', '-s', 'tools/data', '-p', 'test_*.py', '-v']],
  ['Build actual WASM runtime', 'cargo', ['build', '--locked', '--release', '-p', 'valicore-abi', '--target', 'wasm32-unknown-unknown']],
  ['Build actual native runtime', 'cargo', ['build', '--locked', '--release', '-p', 'valicore-abi']],
  ['Assemble verified runtime/data', 'node', ['tools/build.mjs']],
  ['Actual package contents and stale-profile exclusion', 'node', ['tools/test_package_contents.mjs']],
  ['Installed npm tarball offline consumer', 'node', ['tools/test_installed_js.mjs']],
  ['Native and installed Python corpora', 'python3', ['tools/test_native.py']],
  ['WASM, full catalog and transport suites', npm, ['test']],
  ['TypeScript API checks', npm, ['run', 'test:types']],
  ['Compile browser demo', npm, ['run', 'build:demo']],
  ['Assemble browser site', 'node', ['tools/site.mjs']],
  ['HTTP distribution and compression', 'python3', ['tools/test_distribution.py']],
  ['Browser and reusable-selector suites', npx, ['playwright', 'test']],
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const state = JSON.parse(await readFile(join(root, 'data/state.json'), 'utf8'));
const geographicBytes = gunzipSync(await readFile(join(root, 'data', state.snapshot)));
const dataset = JSON.parse(geographicBytes);
const corpusFiles = ['fiscal-vectors.json', 'italian-vat-vectors.json', 'italian-rea-vectors.json', 'birthplace-history-vectors.json'];
const corpora = {}, corpusHashes = {};
for (const filename of corpusFiles) {
  const bytes = await readFile(join(root, 'tests/fixtures', filename));
  corpora[filename] = JSON.parse(bytes); corpusHashes[filename] = digest(bytes);
}
const corpus = corpora['fiscal-vectors.json'], vat = corpora['italian-vat-vectors.json'];
const rea = corpora['italian-rea-vectors.json'], history = corpora['birthplace-history-vectors.json'];
const report = { startedAt: new Date().toISOString(), dataVersion: state.version, scope: ['fiscal', 'geo'],
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  environment: { node: process.version, v8: process.versions.v8, platform: process.platform, architecture: process.arch,
    rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
    cargo: execFileSync('cargo', ['--version'], { encoding: 'utf8' }).trim() },
  geographicDatasetSha256: digest(geographicBytes), corpusHashes,
  referenceCorpusSha256: corpusHashes['fiscal-vectors.json'],
  italianVatCorpusSha256: corpusHashes['italian-vat-vectors.json'],
  italianReaCorpusSha256: corpusHashes['italian-rea-vectors.json'],
  birthplaceHistoryCorpusSha256: corpusHashes['birthplace-history-vectors.json'],
  inventory: { birthplaceHistoryCases: history.cases.length,
    birthplaceHistoryCandidates: history.cases.reduce((count, value) => count + value.candidates.length, 0),
    italianReaValidCases: rea.valid.length, italianReaInvalidCases: rea.invalid.length,
    italianVatValidCases: vat.valid.length, italianVatInvalidCases: vat.invalid.length,
    ordinaryPeople: corpus.vectors.length, inverseOnlyCases: corpus.decodeCases.length, nameFixtures: corpus.names.length,
    positionalChecksumCases: corpus.checksums.length, numericChecksumCases: corpus.numericChecksums.length,
    gregorianCycleDays: 146097, generatedAndInvertedDatesBothSexes: 292194,
    calendarByteBoundaryCases: 7 * 256 * 256, omocodiaPeople: 128, masksPerPerson: 128,
    allMaskTransitions: 128 * 128, deterministicNoiseInputs: 10000, catalogRecords: dataset.places.length },
  steps: [], passed: false };

try {
  for (const [name, command, args] of steps) {
    console.log(`\n[Extensive] ${name}`);
    const start = performance.now();
    if (name === 'Assemble verified runtime/data') {
      const stale = join(root, 'packages/js/bundled/previous-profile');
      await mkdir(stale, { recursive: true });
      await writeFile(join(stale, 'unreferenced.wasm'), 'stale previous-profile output');
    }
    const result = await new Promise(resolveResult => {
      const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
      child.on('error', error => resolveResult({ exitCode: 1, error: error.message }));
      child.on('close', code => resolveResult({ exitCode: code ?? 1 }));
    });
    report.steps.push({ name, ...result, elapsedMs: Math.round(performance.now() - start) });
    if (result.exitCode !== 0) break;
    if (name === 'Assemble verified runtime/data') {
      const manifest = JSON.parse(await readFile(join(root, 'packages/js/bundled/manifest.json'), 'utf8'));
      report.runtime = { buildId: manifest.buildId, wasmSha256: manifest.runtime.wasm.sha256,
        nativeSha256: digest(await readFile(join(root, 'target/release/libvalicore_abi.so'))) };
      if (manifest.runtimeApiMajor !== 8 || manifest.datasets.geo.version !== report.dataVersion
          || manifest.datasets.geo.sha256 !== report.geographicDatasetSha256
          || JSON.stringify(Object.keys(manifest.datasets)) !== JSON.stringify(['geo'])
          || JSON.stringify(manifest.components) !== JSON.stringify(['fiscal', 'geo']))
        throw new Error('Assembled manifest does not match this fiscal/geographic candidate');
    }
    if (name === 'Native and installed Python corpora') {
      const python = report.pythonVerification = JSON.parse(await readFile(join(root, 'verification-reports/python-latest.json'), 'utf8'));
      const bundled = python.bundledWheel;
      if (!python.passed || python.revision !== report.revision
          || !python.tests?.passed || python.tests.skipped !== 0 || python.tests.testsRun < 18
          || !bundled?.tests?.passed || bundled.tests.skipped !== 0 || bundled.tests.testsRun < 5
          || bundled.examplesExecuted !== 2 || python.examplesExecuted !== 2 || !python.compositionExecuted
          || JSON.stringify(bundled.components) !== JSON.stringify(['fiscal', 'geo'])
          || bundled.dataset?.version !== report.dataVersion
          || bundled.dataset?.gzipSha256 !== python.dataset.gzipSha256
          || !/^[a-f0-9]{64}$/.test(bundled.nativeRuntimeSha256)
          || python.nativeRuntimeSha256 !== report.runtime.nativeSha256 || python.dataset.version !== report.dataVersion
          || corpusFiles.some(filename => python.corpora[filename] !== corpusHashes[filename]))
        throw new Error('Installed Python consumers do not match this revision/dataset/corpus');
    }
  }
  report.passed = report.steps.length === steps.length && report.steps.every(step => step.exitCode === 0);
} catch (error) {
  report.error = error.message;
  if (report.steps.length) { report.steps.at(-1).exitCode = 1; report.steps.at(-1).error = error.message; }
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(join(root, 'test-results'), { recursive: true });
  await mkdir(join(root, 'verification-reports'), { recursive: true });
  const bytes = JSON.stringify(report, null, 2) + '\n';
  const archivedReport = `extensive-${report.startedAt.replace(/[:.]/g, '-')}.json`;
  await writeFile(join(root, 'test-results/extensive-report.json'), bytes);
  await writeFile(join(root, 'verification-reports', archivedReport), bytes);
  console.log(`\nExtensive verification ${report.passed ? 'passed' : 'FAILED'}. Report: verification-reports/${archivedReport}`);
  process.exitCode = report.passed ? 0 : 1;
}
