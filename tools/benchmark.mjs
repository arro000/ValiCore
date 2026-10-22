// Local, repeatable measurements; not correctness tests or CI timing thresholds.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { createValiCore } from '../packages/js/src/index.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const samples = Number(flag('--samples', '7'));
if (!Number.isInteger(samples) || samples < 1) throw new Error('--samples must be a positive integer');
const bytes = await readFile(new URL('../packages/js/bundled/places.json', import.meta.url));
const wasm = await readFile(new URL('../packages/js/bundled/engine.wasm', import.meta.url));
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1), samples: values };
};
const report = { measuredAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model,
  datasetSha256: digest(bytes), wasmSha256: digest(wasm), sizes: { datasetBytes: bytes.length, wasmBytes: wasm.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
    brotliBytes: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length },
  initialization: {}, operations: {}, notes: 'Local wall-clock times in ms. WASM bytes are linear-memory high-water capacity, not live heap/RSS. Initialization includes file loading, hashing and instantiation; excludes network transfer.' };
const instantiate = WebAssembly.instantiate;
let memory;
WebAssembly.instantiate = async (...args) => {
  const result = await Reflect.apply(instantiate, WebAssembly, args);
  memory = (result.instance ?? result).exports.memory;
  return result;
};
const timings = [], capacities = [];
try {
  for (let i = 0; i < samples; i++) {
    globalThis.gc?.();
    const start = performance.now();
    const cf = await createValiCore({ distribution: { mode: 'bundled' } });
    timings.push(performance.now() - start); capacities.push(memory.buffer.byteLength);
    cf.dispose(); memory = undefined;
  }
  report.initialization = { milliseconds: summarize(timings), wasmLinearMemoryBytes: summarize(capacities) };
  const cf = await createValiCore({ distribution: { mode: 'bundled' } });
  const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { name: 'Roma', province: 'RM' } };
  const scenarios = [
    ['searchBroad', 200, index => cf.searchPlaces(['a', 'san', 'roma', 'cattolica'][index % 4], { limit: 20 })],
    ['searchProvince', 200, index => cf.searchPlaces(['a', 'san', 'roma', 'ca'][index % 4], { province: 'RM', onDate: '1985-03-15', limit: 20 })],
    ['listProvinces', 40, index => cf.listProvinces({ onDate: ['1985-03-15', '2025-12-31', '2026-01-01', '1993-01-01'][index % 4] })],
    ['encode', 500, () => cf.encode(person)],
    ['decode', 200, () => cf.decode('RSSMRA85C15H501R', { yearRange: [1900, 2099] })],
  ];
  try {
    for (const [name, iterations, run] of scenarios) {
      for (let i = 0; i < 20; i++) run(i);
      const elapsed = [];
      for (let sample = 0; sample < samples; sample++) {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) run(i);
        elapsed.push((performance.now() - start) / iterations);
      }
      report.operations[name] = { callsPerSample: iterations, millisecondsPerCall: summarize(elapsed) };
    }
  } finally { cf.dispose(); }
} finally { WebAssembly.instantiate = instantiate; }
const output = JSON.stringify(report, null, 2) + '\n';
if (args.includes('--output')) await writeFile(flag('--output'), output);
console.log(output);
