import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createValiCore, ValiCoreError } from '../src/index.js';

const corpus = JSON.parse(await readFile(new URL('../../../tests/fixtures/italian-rea-vectors.json', import.meta.url), 'utf8'));

test('REA presentation through real WASM retains zeros and never implies allocation', async () => {
  for (const catalog of [false, true]) {
    const engine = await createValiCore({ catalog, distribution: { mode: 'bundled' } });
    try {
      for (const row of corpus.valid) {
        const report = engine.validateItalianRea(row.input);
        assert.equal(report.valid, true, row.input);
        for (const key of ['rea', 'provinceCode', 'serialNumber']) assert.equal(report[key], row[key]);
        assert.equal(report.scope, 'presentation_format');
        assert.equal(report.countryCode, 'IT');
        assert.deepEqual(report.checks.map(c => [c.name, c.status]), [['structure', 'pass'], ['registry', 'not_run']]);
      }
      for (const row of corpus.invalid) {
        const report = engine.validateItalianRea(row.input);
        assert.equal(report.valid, false, row.input);
        assert.equal(report.rea, null);
        assert.equal(report.checks[0].error.code, row.error);
      }
      for (const input of [undefined, null, 42, false, {}, []]) assert.throws(() => engine.validateItalianRea(input),
        error => error instanceof ValiCoreError && error.code === 'INVALID_ARGUMENT' && error.field === 'rea');
      const report = engine.validateItalianRea('rm-000123456');
      report.checks[1].status = 'pass';
      assert.equal(engine.validateItalianRea('rm-000123456').checks[1].status, 'not_run');
    } finally { engine.dispose(); }
    assert.throws(() => engine.validateItalianRea('RM-123456'), error => error.code === 'ENGINE_DISPOSED');
  }
});
