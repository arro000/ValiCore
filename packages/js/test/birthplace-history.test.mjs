import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createValiCore } from '../src/index.js';

const corpus = JSON.parse(await readFile(new URL('../../../tests/fixtures/birthplace-history-vectors.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url)));
const wasm = await readFile(new URL('../bundled/engine.wasm', import.meta.url));
const CODE = 'RSSMRA85C15H501R';

test('independent history corpus retains every calendar candidate and source partition', async () => {
  for (const fixture of corpus.cases) {
    const dataset = { schemaVersion: 1, version: 'history-js', sources: {}, coverage: {}, places: fixture.records };
    const engine = await createValiCore({ distribution: { mode: 'custom', wasm, datasets: { geo: dataset },
      manifest: { ...manifest, datasets: { geo: { ...manifest.datasets.geo, version: dataset.version } } } } });
    try {
      const report = engine.birthplaceHistory(fixture.code);
      assert.equal(report.scope, 'administrative_birthplace_history');
      assert.equal(report.dataVersion, dataset.version);
      assert.deepEqual(report.candidates.map(({ error, ...value }) => value), fixture.candidates);
      assert.deepEqual(report.decoded.candidateDates, engine.decode(fixture.code).candidateDates);
      assert.equal(report.allocationCheck.status, 'not_run');
      assert.deepEqual(report.records.map(value => value.id), fixture.records.map(value => value.id));
      const single = fixture.candidates.find(value => value.compatible === true);
      const year = Number(single.birthDate.slice(0, 4));
      assert.deepEqual(engine.birthplaceHistory(fixture.code, { yearRange: [year, year] }).candidates[0].birthDate, single.birthDate);
      report.records[0].id = 'changed by caller';
      assert.notEqual(engine.birthplaceHistory(fixture.code).records[0].id, 'changed by caller');
    } finally { engine.dispose(); }
  }
});

test('no data means unknown history; strict arguments and disposal remain enforced', async () => {
  const engine = await createValiCore({ catalog: false, distribution: { mode: 'bundled' } });
  try {
    const report = engine.birthplaceHistory(CODE);
    assert.equal(report.candidates.length, 100);
    assert.equal(report.dataVersion, null);
    assert.equal(report.records.length, 0);
    assert.ok(report.candidates.every(value => value.compatible === null && value.status === 'unknown' && value.error.code === 'CAPABILITY_UNAVAILABLE'));
    for (const code of [undefined, null, 1, true, [], {}])
      assert.throws(() => engine.birthplaceHistory(code), { code: 'INVALID_ARGUMENT' });
    for (const options of [[], true, { onDate: '1985-03-15' }, { yearRange: [1.5, 1985] }, { yearRange: [1985] }])
      assert.throws(() => engine.birthplaceHistory(CODE, options), { code: 'INVALID_ARGUMENT' });
    for (const yearRange of [[0, 1985], [1985, 1984], [1985, 10000]])
      assert.throws(() => engine.birthplaceHistory(CODE, { yearRange }), { code: 'INVALID_YEAR_RANGE' });
    assert.throws(() => engine.birthplaceHistory('RSSMRA85C15H501A'), { code: 'INVALID_CHECKSUM' });
    const dates = engine.birthplaceHistory(CODE).decoded.candidateDates;
    for (const code of engine.omocodes(CODE))
      assert.deepEqual(engine.birthplaceHistory(code).decoded.candidateDates, dates);
  } finally { engine.dispose(); }
  assert.throws(() => engine.birthplaceHistory(CODE), { code: 'ENGINE_DISPOSED' });
});

test('a failed administrative comparison does not change CF validity or bare-code generation', async () => {
  const row = { ...corpus.cases[0].records[0], belfioreCode: 'H501', validFrom: '1800-01-01', validTo: '1900-01-01' };
  const dataset = { schemaVersion: 1, version: 'history-outside', sources: {}, coverage: {}, places: [row] };
  const engine = await createValiCore({ distribution: { mode: 'custom', wasm, datasets: { geo: dataset },
    manifest: { ...manifest, datasets: { geo: { ...manifest.datasets.geo, version: dataset.version } } } } });
  try {
    assert.equal(engine.birthplaceHistory(CODE, { yearRange: [1985, 1985] }).candidates[0].compatible, false);
    assert.equal(engine.validate(CODE).valid, true);
    assert.equal(engine.encode({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } }), CODE);
  } finally { engine.dispose(); }
});
