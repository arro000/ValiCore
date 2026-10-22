import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createValiCore } from '../src/index.js';

const dataset = JSON.parse(await readFile(new URL('../bundled/places.json', import.meta.url), 'utf8'));
const sourceState = JSON.parse(gunzipSync(await readFile(new URL('../../../data/source-state.json.gz', import.meta.url))));
const cf = await createValiCore({ distribution: { mode: 'bundled' } });
after(() => cf.dispose());
const within = (row, date) => (!row.validFrom || row.validFrom <= date) && (!row.validTo || row.validTo >= date);
const byCode = new Map();
for (const row of dataset.places) {
  if (!byCode.has(row.belfioreCode)) byCode.set(row.belfioreCode, []);
  byCode.get(row.belfioreCode).push(row);
}
const ids = rows => rows.map(row => row.id).sort();
const shifted = (date, offset) => {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + offset);
  const result = value.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && !result.startsWith('0000') ? result : null;
};

test('every catalog record resolves exactly at its interval boundaries and neighbouring days', () => {
  let queries = 0;
  for (const row of dataset.places) {
    if (!row.belfioreCode) continue;
    const dates = new Set([row.validFrom ?? row.validTo ?? '2000-01-01']);
    for (const boundary of [row.validFrom, row.validTo].filter(Boolean)) {
      dates.add(boundary);
      for (const offset of [-1, 1]) { const date = shifted(boundary, offset); if (date) dates.add(date); }
    }
    for (const onDate of dates) {
      const expected = byCode.get(row.belfioreCode).filter(candidate => within(candidate, onDate));
      const actual = cf.resolvePlace({ belfioreCode: row.belfioreCode, onDate });
      assert.deepEqual(ids(actual.candidates), ids(expected), `${row.id} at ${onDate}`);
      assert.equal(actual.status, expected.length ? 'unique' : 'missing');
      queries++;
    }
  }
  assert.ok(queries > 50000, `Expected a full archive sweep, got ${queries}`);
  console.log(`Catalog boundary sweep: ${dataset.places.length} records, ${queries} dated queries.`);
});

test('every current ISTAT municipality agrees with the reconciled runtime fiscal/administrative identifiers', () => {
  const onDate = Object.values(dataset.sources).map(source => source.referenceDate).filter(Boolean).sort().at(-1);
  const current = Object.values(sourceState['istat-current']);
  for (const row of current) {
    const resolution = cf.resolvePlace({ istatCode: row.ID, onDate });
    assert.equal(resolution.status, 'unique', row.ID);
    assert.equal(resolution.belfioreCode, row.BELFIORE, row.ID);
    assert.ok(resolution.candidates.some(place => place.province === row.PROVINCE && place.status === 'active'), row.ID);
  }
  assert.ok(current.length > 7800);
  console.log(`Current ISTAT sweep: ${current.length} municipalities.`);
});

test('inverse place lookup retains all historical candidates instead of guessing one current province', () => {
  const decoded = cf.decode('RSSMRA85C15C357C', { yearRange: [1900, 2099] });
  assert.deepEqual(decoded.candidateDates, ['1985-03-15', '2085-03-15']);
  assert.deepEqual(ids(decoded.places), ids(byCode.get('C357')));
  assert.ok(decoded.places.some(place => place.province === 'FO'));
  assert.ok(decoded.places.some(place => place.province === 'RN'));
  const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '2026-01-01', birthplace: { name: 'Olbia' } };
  const olbia = cf.decode(cf.encode(person), { yearRange: [2026, 2026] });
  assert.equal(olbia.belfioreCode, 'G015');
  assert.deepEqual(ids(olbia.places), ids(byCode.get('G015')));
  assert.ok(olbia.places.some(place => place.province === 'SS'));
  assert.ok(olbia.places.some(place => place.province === 'OT'));
});

test('province availability and distinct counts match an independent linear oracle across dated filters', () => {
  for (const onDate of ['0001-01-01', '1861-03-17', '1900-01-01', '1985-03-15', '1992-04-15', '1992-04-16', '2010-01-01', '2025-12-31', '2026-01-01', '2026-06-04', '9999-12-31']) {
    for (const activeOnly of [false, true]) {
      for (const kind of [undefined, 'municipality', 'foreign_country', 'foreign_territory']) {
        const expected = new Map();
        for (const row of dataset.places) {
          if (!within(row, onDate) || activeOnly && row.status !== 'active' || kind && row.kind !== kind || row.birthAllowed === false || !row.province || !row.belfioreCode) continue;
          if (!expected.has(row.province)) expected.set(row.province, new Set());
          expected.get(row.province).add(row.belfioreCode);
        }
        const actual = cf.listProvinces({ onDate, activeOnly, kind });
        assert.deepEqual(actual.map(row => [row.code, row.placeCount]).sort(), [...expected].map(([code, codes]) => [code, codes.size]).sort());
        for (const row of actual) {
          const labels = (dataset.provinces ?? []).filter(label => label.code === row.code && within(label, onDate));
          assert.ok(labels.length <= 1);
          assert.equal(row.name, labels[0]?.name ?? null);
          assert.deepEqual(row.aliases, labels[0]?.aliases ?? []);
        }
      }
    }
  }
});

test('representative names, aliases, filters, limits, and sorting remain consistent across the full catalog', () => {
  const samples = dataset.places.filter((_, index) => index % 80 === 0);
  for (const row of samples) {
    const onDate = row.validFrom ?? row.validTo ?? '2000-01-01';
    for (const name of [row.name, row.aliases[0]].filter(Boolean)) {
      const result = cf.searchPlaces(name, { onDate, province: row.province ?? undefined, limit: 200 });
      assert.ok(result.some(candidate => candidate.id === row.id), `${row.id}: ${name}`);
      for (const candidate of result) assert.ok(within(candidate, onDate) && candidate.province === row.province);
      assert.deepEqual(result, cf.searchPlaces(name, { onDate, province: row.province ?? undefined, limit: 200 }));
    }
  }
  for (const limit of [0, 1, 20, 50, 200, 201, 1000]) {
    assert.ok(cf.searchPlaces('San', { limit }).length <= Math.min(limit, 200));
  }
  assert.deepEqual(cf.searchPlaces(''), []);
  assert.deepEqual(cf.searchPlaces('---'), []);
});
