import ts from 'typescript';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(join(root, 'apps/demo/src/examples.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { integrationExample } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const operations = ['calculate', 'inspect', 'omocodia', 'places', 'selector', 'match', 'utilities', 'distribution'];
const directory = await mkdtemp(join(tmpdir(), 'valicore-demo-examples-'));
try {
  const files = [];
  for (const operation of operations) {
    const file = join(directory, `${operation}.ts`);
    await writeFile(file, integrationExample(operation, 'ts')); files.push(file);
  }
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, strict: true, skipLibCheck: true,
    paths: { '@arro000/valicore': [join(root, 'packages/js/src/index.d.ts')],
      '@arro000/valicore/ui': [join(root, 'packages/js/src/ui.d.ts')] } });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
  const engineUrl = pathToFileURL(join(root, 'packages/js/src/index.js')).href;
  const uiUrl = pathToFileURL(join(root, 'packages/js/src/ui.js')).href;
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);
  try {
    for (const operation of operations.filter(item => item !== 'selector')) {
      for (const language of ['js', 'ts']) {
        let code = integrationExample(operation, language);
        if (language === 'ts') code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
        code = code.replaceAll("'@arro000/valicore'", JSON.stringify(engineUrl)).replaceAll("'@arro000/valicore/ui'", JSON.stringify(uiUrl));
        await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${operation}-${language}`);
      }
    }
  } finally { console.log = originalLog; }
  assert.ok(logs.some(row => row[0] === 'RSSMRA85C15H501R'));
  assert.ok(logs.some(row => row[0] === 128));
  assert.ok(logs.some(row => row[0] === 'GFR'));
  assert.ok(logs.some(row => row[0] === 'format_checksum'));
  assert.ok(logs.some(row => row[0] === 'presentation_format'));
  assert.ok(logs.some(row => JSON.stringify(row[0]) === JSON.stringify(['fiscal'])));
  console.log('Verified 8 TypeScript integration examples and executed 14 JS/TS examples against actual WASM.');
} finally { await rm(directory, { recursive: true, force: true }); }
