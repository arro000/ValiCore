#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { compose } from './build.js';

export async function main(args = process.argv.slice(2), defaults = {}) {
  if (args.includes('--help')) {
    console.log('ValiCore composition builder\n  valicore-build --config app.json --output new-directory [--target wasm|native]\n  valicore-build --profile fiscal --output new-directory\n  Custom: --compile --source /trusted/ValiCore (installed Rust/cache; WASM target for wasm)\n  Data: select datasets in configuration; --data geo=/trusted/data.json.gz\n  Precompiled: --precompiled /supplied/profiles (never a nearest-superset fallback)\n  No network, compiler installation or live data sync is performed. Existing outputs are never replaced.');
    return;
  }
  const values = {}, resources = {};
  let compile = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--compile') { if (compile) throw new Error('Duplicate --compile'); compile = true; continue; }
    if (!['--config', '--profile', '--output', '--target', '--source', '--precompiled', '--data', '--datasets', '--cargo-target-directory'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${key}`);
    const value = args[++i];
    if (key === '--data') {
      const index = value.indexOf('='); if (index < 1 || index === value.length - 1) throw new Error('--data requires identifier=path');
      const id = value.slice(0, index); if (Object.hasOwn(resources, id)) throw new Error(`Duplicate --data ${id}`);
      resources[id] = value.slice(index + 1);
    } else { if (Object.hasOwn(values, key)) throw new Error(`Duplicate ${key}`); values[key] = value; }
  }
  if (Boolean(values['--config']) === Boolean(values['--profile'])) throw new Error('Choose exactly one --config or --profile');
  if (values['--source'] && !compile) throw new Error('--source requires explicit --compile');
  if (values['--config'] && values['--datasets']) throw new Error('--datasets is only a shorthand with --profile; configure datasets in your JSON file');
  const config = values['--config'] ? JSON.parse(await readFile(values['--config'], 'utf8'))
    : { configVersion: 1, profile: values['--profile'], ...(values['--datasets'] ? { datasets: values['--datasets'].split(',') } : {}) };
  const selected = config.datasets ?? [];
  for (const id of Object.keys(resources)) if (!selected.includes(id)) throw new Error(`--data ${id} is not explicitly selected in datasets`);
  const result = await compose(config, { ...defaults, output: values['--output'], target: values['--target'] ?? 'wasm', mode: compile ? 'compile' : 'precompiled',
    sourceRoot: values['--source'], precompiledDirectory: values['--precompiled'], cargoTargetDirectory: values['--cargo-target-directory'], resources });
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`${error.code ?? 'BUILD_FAILED'}: ${error.message}`); process.exitCode = 1; });
}
