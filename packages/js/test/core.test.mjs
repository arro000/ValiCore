import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createValiCore, ValiCoreError } from '../src/index.js';

const cf = await createValiCore({ distribution: { mode: 'bundled' } });
after(() => cf.dispose());
const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };

test('actual WASM calculates and validates known independent vectors', () => {
  assert.equal(cf.encode(person), 'RSSMRA85C15H501R');
  assert.equal(cf.encode({ name: 'Fabio', surname: 'Caccamo', sex: 'M', birthDate: '1985-04-03', birthplace: { belfioreCode: 'L219' } }), 'CCCFBA85D03L219P');
  assert.equal(cf.isValid('rssmra85c15h501r'), true);
  assert.equal(cf.numericChecksum('0636339100'), '1');
  assert.equal(cf.validate('06363391001').kind, 'numeric');
});

test('all 128 masks work for already omocodic input', () => {
  const codes = cf.omocodes(cf.toOmocode(cf.encode(person), 127));
  assert.equal(new Set(codes).size, 128);
  for (const [mask, code] of codes.entries()) {
    assert.equal(cf.isValid(code), true);
    assert.equal(cf.omocodiaMask(code), mask);
    assert.equal(cf.toBase(code), 'RSSMRA85C15H501R');
    assert.equal(cf.matchesPerson(code, person).matches, true);
  }
  assert.throws(() => cf.toOmocode(codes[0], 128), error => error.code === 'INVALID_MASK');
});

test('invalid dates, inputs, and checksum have structured English errors', () => {
  assert.throws(() => cf.encode({ ...person, birthDate: '1985-02-31' }), error => error instanceof ValiCoreError && error.code === 'INVALID_DATE');
  assert.equal(cf.validate('RSSMRA85B31H501B').valid, false);
  assert.equal(cf.validate('RSSMRA85A00H501A').valid, false);
  assert.equal(cf.validate('RSSMRA85C15H501A').valid, false);
  assert.equal(cf.validate('RSSMRA85A01A000H').valid, null);
  assert.throws(() => cf.isOmocode('invalid'), ValiCoreError);
  assert.equal(cf.surnameCode('Éé'), 'EEX');
});

test('ANPR history resolves fusion dates and aliases', () => {
  assert.equal(cf.resolvePlace({ name: 'Castegnero', onDate: '2026-02-20' }).belfioreCode, 'C056');
  assert.equal(cf.resolvePlace({ name: 'Castegnero', onDate: '2026-02-21' }).status, 'missing');
  assert.equal(cf.resolvePlace({ name: 'Castegnero Nanto', onDate: '2026-02-21' }).belfioreCode, 'M439');
  assert.equal(cf.resolvePlace({ name: "United States" }).belfioreCode, 'Z404');
  assert.ok(cf.searchPlaces('Castegnero').some(place => place.status === 'ceased'));
  assert.ok(cf.datasetInfo().coverage.missingBelfioreRecords > 0);
});

test('decoding exposes century ambiguity instead of guessing', () => {
  const decoded = cf.decode(cf.encode(person), { yearRange: [1900, 2099] });
  assert.deepEqual(decoded.candidateDates, ['1985-03-15', '2085-03-15']);
  assert.equal(decoded.centuryAmbiguous, true);
  assert.equal(decoded.nameCode, 'MRA');
  assert.ok(decoded.places.some(place => place.name === 'ROMA'));
});

test('ANPR preserves Cattolica historical province and unchanged fiscal code', () => {
  const historic = cf.resolvePlace({ name: 'Cattolica', onDate: '1985-03-15' });
  assert.equal(historic.status, 'unique');
  assert.equal(historic.belfioreCode, 'C357');
  assert.equal(historic.candidates[0].province, 'FO');
  assert.equal(cf.resolvePlace({ name: 'Cattolica', onDate: '1992-04-15' }).candidates[0].province, 'FO');
  assert.equal(cf.resolvePlace({ name: 'Cattolica', onDate: '1992-04-16' }).candidates[0].province, 'RN');
  assert.equal(cf.encode({ ...person, birthplace: { name: 'Cattolica' } }), 'RSSMRA85C15C357C');
  assert.equal(cf.encode({ ...person, birthplace: { belfioreCode: 'C357', province: 'FO', onDate: person.birthDate } }), 'RSSMRA85C15C357C');
});

test('province choices follow administrative dates and include foreign birthplaces', () => {
  const historic = cf.listProvinces({ onDate: '1985-03-15' });
  assert.ok(historic.some(province => province.code === 'FO' && province.placeCount > 0));
  assert.ok(!historic.some(province => province.code === 'RN'));
  assert.ok(historic.some(province => province.code === 'EE'));
  const current = cf.listProvinces({ onDate: '2026-06-04', kind: 'municipality' });
  assert.ok(current.some(province => province.code === 'RN'));
  assert.ok(!current.some(province => province.code === 'EE'));
  assert.throws(() => cf.listProvinces({ onDate: '1985-02-31' }), error => error.code === 'INVALID_DATE');
});

test('province names are searchable independently of accents, case, and code', () => {
  const options = { onDate: '1985-03-15' };
  const forli = cf.listProvinces({ ...options, query: 'forli' });
  assert.ok(forli.some(province => province.code === 'FO' && province.name === 'Forlì'));
  assert.ok(!forli.some(province => province.code === 'FC'));
  assert.deepEqual(cf.listProvinces({ ...options, query: 'rOmA' }).map(province => province.code), ['RM']);
  assert.equal(cf.listProvinces({ ...options, query: 'FO' }).find(province => province.code === 'FO').name, 'Forlì');
  assert.equal(cf.listProvinces({ onDate: '2026-06-04', query: 'forli cesena' })[0].name, 'Forlì-Cesena');
});

test('ISTAT reconciliation dates Sardinian membership and province names without changing Belfiore', () => {
  const before = cf.resolvePlace({ name: 'Olbia', onDate: '2025-12-31' });
  const after = cf.resolvePlace({ name: 'Olbia', onDate: '2026-01-01' });
  assert.equal(before.candidates.length, 1);
  assert.equal(after.candidates.length, 1);
  assert.equal(before.candidates[0].province, 'SS');
  assert.equal(before.candidates[0].istatCode, '090047');
  assert.equal(after.candidates[0].province, 'OT');
  assert.equal(after.candidates[0].istatCode, '113017');
  assert.equal(after.candidates[0].sourceId, 'istat-current');
  assert.equal(before.belfioreCode, 'G015');
  assert.equal(after.belfioreCode, 'G015');
  assert.equal(cf.resolvePlace({ name: 'Olbia', province: 'SS', onDate: '2026-01-01' }).status, 'missing');
  assert.equal(cf.resolvePlace({ istatCode: '118006', onDate: '2026-01-01' }).belfioreCode, 'B354');
  assert.equal(cf.listProvinces({ onDate: '2010-01-01', query: 'Olbia Tempio' })[0].name, 'Olbia-Tempio');
  assert.equal(cf.listProvinces({ onDate: '2026-01-01', query: 'Gallura' })[0].name, 'Gallura Nord-Est Sardegna');
  assert.deepEqual(cf.listProvinces({ onDate: '2026-01-01', query: 'Olbia Tempio' }), []);
  assert.equal(cf.listProvinces({ onDate: '2026-01-01', query: 'Sulcis' })[0].code, 'CI');
  assert.equal(cf.resolvePlace({ name: 'Vallecrosia Al Mare', onDate: '2026-06-04' }).belfioreCode, 'L599');
  assert.equal(cf.datasetInfo().coverage.administrativeReconciliation.conflicts, 1);
});

test('explicit disposal rejects further calls', async () => {
  const temporary = await createValiCore({ distribution: { mode: 'bundled' } });
  temporary.dispose(); temporary.dispose();
  assert.throws(() => temporary.encode(person), error => error.code === 'ENGINE_DISPOSED');
});
