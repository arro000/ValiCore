import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../packages/js/src/index.js', import.meta.url), 'utf8');
const corpus = JSON.parse(await readFile(new URL('../fixtures/birthplace-history-vectors.json', import.meta.url), 'utf8'));

test('browser administrative history preserves all candidate dates and independent interval evidence', async ({ page }) => {
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const result = await page.evaluate(async ({ source, corpus }) => {
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { createValiCore } = await import(moduleUrl);
    const manifestUrl = new URL('/ValiCore/dist/channels/v1/latest.json', location.href).href;
    const manifest = await (await fetch(manifestUrl)).json();
    const wasm = new Uint8Array(await (await fetch(new URL(manifest.runtime.wasm.url, manifestUrl))).arrayBuffer());
    let cases = 0, candidates = 0;
    try {
      for (const fixture of corpus.cases) {
        const dataset = { schemaVersion: 1, version: 'browser-history', sources: {}, coverage: {}, places: fixture.records };
        const engine = await createValiCore({ distribution: { mode: 'custom', wasm, datasets: { geo: dataset },
          manifest: { ...manifest, datasets: { geo: { ...manifest.datasets.geo, version: dataset.version } } } } });
        try {
          const report = engine.birthplaceHistory(fixture.code);
          const actual = report.candidates.map(({ error, ...row }: {error?: unknown}) => row);
          if (actual.length !== fixture.candidates.length) throw new Error('Candidate count differs from independent oracle');
          if (JSON.stringify(actual) !== JSON.stringify(fixture.candidates)) {
            // Property ordering is not a wire semantic; compare each field.
            for (let index = 0; index < actual.length; index++)
              for (const [key, value] of Object.entries(fixture.candidates[index]))
                if (JSON.stringify((actual[index] as Record<string, unknown>)[key]) !== JSON.stringify(value))
                  throw new Error(`Independent history mismatch: ${fixture.code} ${key}`);
          }
          if (report.candidates.length !== report.decoded.candidateDates.length || report.allocationCheck.status !== 'not_run')
            throw new Error('Candidates filtered or allocation fabricated');
          cases++;
          candidates += report.candidates.length;
        } finally { engine.dispose(); }
      }
      const engine = await createValiCore({ catalog: false, distribution: { mode: 'custom', wasm, manifest } });
      try {
        const report = engine.birthplaceHistory('RSSMRA85C15H501R');
        return { cases, candidates, missingDataCount: report.candidates.length,
          unknown: report.candidates.every((row: {compatible: unknown, status: string}) => row.compatible === null && row.status === 'unknown'),
          valid: engine.validate('RSSMRA85C15H501R', { level: 'calendar' }).valid };
      } finally { engine.dispose(); }
    } finally { URL.revokeObjectURL(moduleUrl); }
  }, { source, corpus });
  expect(result.cases).toBe(corpus.cases.length);
  expect(result.candidates).toBe(corpus.cases.reduce((count: number, row: {candidates: unknown[]}) => count + row.candidates.length, 0));
  expect(result.missingDataCount).toBe(100);
  expect(result.unknown).toBe(true);
  expect(result.valid).toBe(true);
});
