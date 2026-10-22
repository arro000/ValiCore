import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createValiCore, ValiCoreError } from '../src/index.js';

const corpus = JSON.parse(await readFile(new URL('../../../tests/fixtures/italian-vat-vectors.json', import.meta.url), 'utf8'));

test('Italian VAT real WASM agrees with independent vectors, without implying registration', async () => {
  for (const catalog of [false, true]) {
    const engine = await createValiCore({ catalog, distribution: { mode: 'bundled' } });
    try {
      for (const row of corpus.valid) {
        for (const prefix of ['', 'IT', 'it']) {
          const report = engine.validateItalianVat(prefix + row.input);
          assert.equal(report.valid, true, row.input);
          assert.equal(report.vat, row.vat);
          assert.equal(report.countryCode, 'IT');
          assert.equal(report.scope, 'format_checksum');
          assert.deepEqual(report.checks.map(check => [check.name, check.status]),
            [['structure', 'pass'], ['checksum', 'pass'], ['registry', 'not_run']]);
        }
      }
      for (const row of corpus.invalid) {
        const report = engine.validateItalianVat(row.input);
        assert.equal(report.valid, false, row.input);
        assert.equal(report.checks.find(check => check.status === 'fail').error.code, row.error);
        assert.equal(report.checks.at(-1).status, 'not_run');
      }
      // No invented serial/office allocation restriction: even a placeholder
      // can pass these bounded checks, and never acquires registration status.
      assert.equal(engine.validateItalianVat('00000000000').valid, true);
      for (const value of [undefined, null, false, 42, 1.5, {}, []]) {
        assert.throws(() => engine.validateItalianVat(value),
          error => error instanceof ValiCoreError && error.code === 'INVALID_ARGUMENT' && error.field === 'vat');
      }
      // The existing JSON transport rejects nonfinite numbers before dispatch;
      // this generic boundary error intentionally has no domain field.
      for (const value of [NaN, Infinity, -Infinity]) {
        assert.throws(() => engine.validateItalianVat(value),
          error => error instanceof ValiCoreError && error.code === 'INVALID_ARGUMENT'
            && error.field === undefined && error.message.includes('finite JSON numbers'));
      }
    } finally { engine.dispose(); }
    assert.throws(() => engine.validateItalianVat('06363391001'), error => error.code === 'ENGINE_DISPOSED');
  }
});
