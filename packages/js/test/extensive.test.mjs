import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createValiCore } from '../src/index.js';

const corpus = JSON.parse(await readFile(new URL('../../../tests/fixtures/fiscal-vectors.json', import.meta.url), 'utf8'));
const wasm = new Uint8Array(await readFile(new URL('../bundled/engine.wasm', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../bundled/manifest.json', import.meta.url), 'utf8'));
const dataset = { schemaVersion: 1, version: 'golden-corpus', sources: {}, coverage: {},
  places: [...new Set(corpus.vectors.map(row => row.person.birthplace.belfioreCode))].map(code => ({
    id: code, sourceId: 'synthetic-golden', sourceRecordId: code, name: `TEST ${code}`, aliases: [], kind: code.startsWith('Z') ? 'foreign_country' : 'municipality',
    status: 'active', belfioreCode: code, istatCode: null, province: code.startsWith('Z') ? 'EE' : 'AA', validFrom: null, validTo: null, birthAllowed: true,
  })) };
const options = { distribution: { mode: 'custom', wasm, datasets: { geo: dataset }, manifest: { ...manifest, datasets: { geo: { ...manifest.datasets.geo, version: dataset.version } } } } };
const cf = await createValiCore(options);
after(() => cf.dispose());

test('WASM agrees with every independent fiscal, name, and checksum reference vector', () => {
  for (const row of corpus.vectors) {
    assert.equal(cf.encode(row.person), row.code, row.id);
    assert.equal(cf.nameCode(row.person.name), row.nameCode);
    assert.equal(cf.surnameCode(row.person.surname), row.surnameCode);
    assert.equal(cf.toBase(row.code), row.baseCode);
    const year = Number(row.person.birthDate.slice(0, 4));
    const decoded = cf.decode(row.code, { yearRange: [year, year] });
    assert.deepEqual(decoded.candidateDates, [row.person.birthDate]);
    assert.equal(decoded.sex, row.person.sex);
    assert.equal(decoded.nameCode, row.nameCode);
    assert.equal(decoded.surnameCode, row.surnameCode);
    assert.equal(decoded.month, Number(row.person.birthDate.slice(5, 7)));
    assert.equal(decoded.day, Number(row.person.birthDate.slice(8)));
    assert.equal(decoded.omocodiaMask, row.person.omocodiaMask ?? 0);
    assert.equal(cf.validate(row.code, { yearRange: [year, year] }).valid, true);
    assert.equal(cf.matchesPerson(row.code, row.person).matches, true);
  }
  for (const row of corpus.names) {
    assert.equal(cf.nameCode(row.input), row.nameCode);
    assert.equal(cf.surnameCode(row.input), row.surnameCode);
  }
  for (const row of corpus.checksums) assert.equal(cf.checksum(row.body), row.expected);
  for (const row of corpus.numericChecksums) {
    assert.equal(cf.numericChecksum(row.body), row.expected);
    assert.equal(cf.validate(row.body + row.expected).valid, true);
    for (let digit = 0; digit < 10; digit++) {
      assert.equal(cf.validate(row.body + digit).valid, String(digit) === row.expected);
    }
  }
});

test('independent inverse-only codes expose date candidates, sex, fragments and impossible encodings', () => {
  for (const row of corpus.decodeCases) {
    if (row.error) assert.throws(() => cf.decode(row.code, row.options), error => error.code === row.error);
    else {
      const decoded = cf.decode(row.code, row.options);
      for (const [field, expected] of Object.entries(row.expected)) assert.deepEqual(decoded[field], expected, `${row.code} ${field}`);
      assert.equal(decoded.name, undefined);
      assert.equal(decoded.surname, undefined);
      assert.ok(decoded.places.every(place => place.belfioreCode === decoded.belfioreCode));
    }
  }
});

test('unrestricted inverse lists every matching century using the host Gregorian calendar as oracle', () => {
  for (const row of corpus.vectors) {
    const yearTwoDigits = Number(row.person.birthDate.slice(0, 4)) % 100;
    const suffix = row.person.birthDate.slice(4);
    const expected = [];
    for (let year = yearTwoDigits || 100; year <= 9999; year += 100) {
      const date = String(year).padStart(4, '0') + suffix;
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) expected.push(date);
    }
    const decoded = cf.decode(`  ${row.code.toLowerCase()}\n`);
    assert.deepEqual(decoded.candidateDates, expected, row.id);
    assert.equal(decoded.centuryAmbiguous, expected.length > 1);
    assert.equal(decoded.code, row.code);
    assert.equal(decoded.baseCode, row.baseCode);
    assert.equal(decoded.nameCode, row.nameCode);
    assert.equal(decoded.surnameCode, row.surnameCode);
    assert.equal(decoded.belfioreCode, row.person.birthplace.belfioreCode);
    assert.equal(decoded.places.length, 1);
    assert.equal(decoded.dataVersion, dataset.version);
  }
});

test('128 masks preserve decoded fields for 32 independently specified ordinary people', () => {
  for (const row of corpus.vectors.slice(0, 32)) {
    const year = Number(row.person.birthDate.slice(0, 4));
    const variants = cf.omocodes(row.code);
    assert.equal(new Set(variants).size, 128);
    for (let mask = 0; mask < 128; mask++) {
      const decoded = cf.decode(variants[mask], { yearRange: [year, year] });
      assert.equal(decoded.baseCode, row.baseCode);
      assert.equal(decoded.sex, row.person.sex);
      assert.deepEqual(decoded.candidateDates, [row.person.birthDate]);
      assert.equal(cf.omocodiaMask(variants[mask]), mask);
      assert.equal(cf.sameBase(variants[mask], row.code), true);
    }
  }
});

test('JS/JSON argument boundaries return structured errors, including noninteger numbers', () => {
  const cases = [];
  for (const value of [null, undefined, 42, true, {}, [], ['Mario']]) {
    for (const [method, args] of [['nameCode', [value]], ['surnameCode', [value]], ['checksum', [value]], ['numericChecksum', [value]], ['decode', [value]], ['searchPlaces', [value]]]) {
      cases.push([method, args, 'INVALID_ARGUMENT']);
    }
  }
  for (const mask of [-1, 128, 255, 1.5, NaN, Infinity, '1', null, undefined, false]) cases.push(['toOmocode', ['RSSMRA85C15H501R', mask], typeof mask === 'number' && !Number.isFinite(mask) ? 'INVALID_ARGUMENT' : 'INVALID_MASK']);
  for (const yearRange of [[0, 2000], [2000, 1900], [1, 10000]]) cases.push(['decode', ['RSSMRA85C15H501R', { yearRange }], 'INVALID_YEAR_RANGE']);
  for (const yearRange of [[], [2000], [1900, 2000, 2100], [-1, 2000], [1.5, 2000], ['1900', 2000], null]) {
    if (yearRange !== null) cases.push(['decode', ['RSSMRA85C15H501R', { yearRange }], 'INVALID_ARGUMENT']);
  }
  for (const limit of [-1, 1.5, '20', Infinity, NaN, -Infinity]) cases.push(['searchPlaces', ['TEST', { limit }], 'INVALID_ARGUMENT']);
  for (const options of [{ unexpected: true }, { onDate: 123 }, { activeOnly: 'yes' }]) cases.push(['listProvinces', [options], 'INVALID_ARGUMENT']);
  for (const query of [{}, { name: 'TEST', belfioreCode: 'H501' }, { belfioreCode: 'H501', istatCode: '001001' }]) cases.push(['resolvePlace', [query], 'INVALID_PLACE_QUERY']);
  for (const [method, args, code] of cases) {
    assert.throws(() => cf[method](...args), error => error.name === 'ValiCoreError' && error.code === code && error.message.length > 0,
      `${method}(${JSON.stringify(args)}) should report ${code}`);
  }
});

test('every person mismatch is attributed and name-code collisions do not prove identity', () => {
  const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };
  const code = cf.encode(person);
  for (const [change, expected] of [[{ name: 'Fabio' }, 'name'], [{ surname: 'Bianchi' }, 'surname'], [{ sex: 'F' }, 'dayAndSex'],
    [{ birthDate: '1985-03-16' }, 'dayAndSex'], [{ birthDate: '1985-04-15' }, 'birthDate'], [{ birthplace: { belfioreCode: 'Z404' } }, 'birthplace']]) {
    const result = cf.matchesPerson(code, { ...person, ...change });
    assert.equal(result.matches, false);
    assert.ok(result.mismatches.includes(expected));
  }
  // Two people a century apart can produce the same encoded year. This API
  // compares encoded components, not allocation or personal identity.
  assert.equal(cf.matchesPerson(code, { ...person, birthDate: '2085-03-15' }).matches, true);
  assert.equal(cf.matchesPerson('invalid', person).matches, false);
});

test('independent engine instances and returned objects remain isolated through repeated disposal', async () => {
  for (let iteration = 0; iteration < 48; iteration++) {
    const other = await createValiCore(options);
    const info = other.versionInfo(); info.engineVersion = 'changed';
    const result = other.resolvePlace({ belfioreCode: 'H501' }); result.candidates[0].name = 'changed';
    assert.notEqual(other.versionInfo().engineVersion, 'changed');
    assert.notEqual(other.resolvePlace({ belfioreCode: 'H501' }).candidates[0].name, 'changed');
    other.dispose(); other.dispose();
    for (const [method, args] of [['nameCode', ['Mario']], ['encode', [corpus.vectors[0].person]], ['validate', ['invalid']],
      ['searchPlaces', ['TEST']], ['listProvinces', []], ['resolvePlace', [{ belfioreCode: 'H501' }]], ['datasetInfo', []]]) {
      assert.throws(() => other[method](...args), error => error.code === 'ENGINE_DISPOSED');
    }
    assert.equal(cf.nameCode('Mario'), 'MRA');
  }
});

test('custom distribution checks WASM integrity, schema, version, and runtime identity', async () => {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const [change, code] of [[{ datasets: { geo: { ...dataset, version: 'other' } } }, 'INCOMPATIBLE_DATASET'],
    [{ datasets: { geo: { ...dataset, schemaVersion: 2 } } }, 'INCOMPATIBLE_DATASET'],
    [{ manifest: { ...options.distribution.manifest, engineVersion: 'other' } }, 'INCOMPATIBLE_RUNTIME'],
    [{ wasm: wasm.slice(0, 100) }, 'HASH_MISMATCH'], [{ datasets: { geo: { ...dataset, places: [...dataset.places, dataset.places[0]] } } }, 'INVALID_DATASET']]) {
    await assert.rejects(createValiCore({ distribution: { ...options.distribution, ...change } }), error => error.code === code);
  }
  assert.equal(digest(wasm), options.distribution.manifest.runtime.wasm.sha256);
});
