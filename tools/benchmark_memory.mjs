// Fresh-process RSS diagnostics. RSS is not a live heap or WASM-only metric.
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';

const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
if (args.includes('--worker')) {
  if (!globalThis.gc) throw new Error('Memory workers require --expose-gc');
  const collect = async () => {
    for (let i = 0; i < 3; i++) { globalThis.gc(); await new Promise(setImmediate); }
  };
  await collect();
  const before = process.memoryUsage();
  const instantiate = WebAssembly.instantiate;
  let memory;
  WebAssembly.instantiate = async (...input) => {
    const result = await Reflect.apply(instantiate, WebAssembly, input);
    memory = (result.instance ?? result).exports.memory;
    return result;
  };
  let cf;
  try {
    const start = performance.now();
    const { createValiCore } = await import('../packages/js/src/index.js');
    cf = await createValiCore({ distribution: { mode: 'bundled' } });
    const initializationMs = performance.now() - start;
    const code = cf.encode({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { name: 'Roma', province: 'RM' } });
    if (code !== 'RSSMRA85C15H501R') throw new Error('Memory measurement produced an unexpected fiscal code');
    await collect();
    const retained = process.memoryUsage();
    console.log(JSON.stringify({ initializationMs, before, retained,
      additionalRssBytes: retained.rss - before.rss,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      wasmLinearMemoryBytes: memory.buffer.byteLength, versions: cf.versionInfo() }));
  } finally { cf?.dispose(); WebAssembly.instantiate = instantiate; }
} else {
  const count = Number(flag('--samples', '5'));
  if (!Number.isInteger(count) || count < 1) throw new Error('--samples must be a positive integer');
  const samples = [];
  for (let i = 0; i < count; i++) {
    const child = spawnSync(process.execPath, ['--expose-gc', import.meta.filename, '--worker'], { encoding: 'utf8', timeout: 60000 });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(child.stderr || `Memory worker exited with status ${child.status}`);
    samples.push(JSON.parse(child.stdout));
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const report = { measuredAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model,
    notes: 'Sequential fresh Node processes; local bundled files; no network. GC before baseline and after initialization plus one verified encode. Initialization includes dynamic module import and WASM compilation. RSS includes V8/native allocators and retained pages, not just live library data; peak includes the process baseline. Filesystem cache is not flushed.',
    summary: Object.fromEntries(['initializationMs', 'additionalRssBytes', 'peakRssBytes', 'wasmLinearMemoryBytes'].map(name => [name, median(samples.map(sample => sample[name]))])), samples };
  const output = JSON.stringify(report, null, 2) + '\n';
  if (args.includes('--output')) await writeFile(flag('--output'), output);
  console.log(output);
}
