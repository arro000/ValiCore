import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../../packages/js/src/index.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../../packages/js/src/ui.js', import.meta.url), 'utf8');

test('native select adapter follows dated records, restores attributes and detaches listeners', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const result = await page.evaluate(async sources => {
    const urls = [sources.index, sources.ui].map(source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    const [{ createValiCore }, { attachPlaceSelector }] = await Promise.all(urls.map(url => import(url)));
    const manifestUrl = new URL('/dist/channels/v1/latest.json', location.href);
    const manifest = await (await fetch(manifestUrl)).json();
    const wasm = await (await fetch(new URL(manifest.runtime.wasm.url, manifestUrl))).arrayBuffer();
    const dataset = await (await fetch(new URL(manifest.datasets.geo.url, manifestUrl))).json();
    const engine = await createValiCore({ distribution: { mode: 'custom', manifest, wasm, datasets: { geo: dataset } } });
    const container = document.createElement('div');
    container.innerHTML = '<input type="date" value="1985-03-15"><select><option value="FO" selected>Old option</option></select><input value="Cattolica" list="original-list" autocomplete="on">';
    document.body.append(container);
    const [date, municipality] = container.querySelectorAll<HTMLInputElement>('input');
    const province = container.querySelector('select')!;
    let changes = 0;
    const selector = attachPlaceSelector({ engine, date, province, municipality, onChange: () => changes++ });
    const first = selector.value;
    municipality.value = 'CATTOLICA · FO'; municipality.dispatchEvent(new Event('input'));
    const query = selector.query();
    date.value = '1992-04-16'; date.dispatchEvent(new Event('input'));
    const afterDate = { province: province.value, municipality: municipality.value, code: selector.value?.belfioreCode };
    const namedOptions = [...province.options].some(option => option.text.includes('Rimini (RN)'));
    selector.dispose();
    const detachedChanges = changes;
    date.value = '1985-03-15'; date.dispatchEvent(new Event('input'));
    municipality.value = 'Roma'; municipality.dispatchEvent(new Event('input'));
    const restored = { list: municipality.getAttribute('list'), autocomplete: municipality.getAttribute('autocomplete'), datalists: container.querySelectorAll('datalist').length, noEvents: changes === detachedChanges };
    engine.dispose(); container.remove(); urls.forEach(url => URL.revokeObjectURL(url));
    return { first: first?.belfioreCode, query, afterDate, namedOptions, restored };
  }, { index, ui });
  expect(result.first).toBe('C357');
  expect(result.query).toEqual({ belfioreCode: 'C357', province: 'FO', onDate: '1985-03-15' });
  expect(result.afterDate).toEqual({ province: 'RN', municipality: 'CATTOLICA · RN', code: 'C357' });
  expect(result.namedOptions).toBe(true);
  expect(result.restored).toEqual({ list: 'original-list', autocomplete: 'on', datalists: 0, noEvents: true });
});

test('same-name/same-province suggestions select distinct fiscal codes and invalid input recovers', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const result = await page.evaluate(async sources => {
    const urls = [sources.index, sources.ui].map(source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    const [{ createValiCore }, { attachPlaceSelector }] = await Promise.all(urls.map(url => import(url)));
    const manifestUrl = new URL('/dist/channels/v1/latest.json', location.href);
    const manifest = await (await fetch(manifestUrl)).json();
    const wasm = await (await fetch(new URL(manifest.runtime.wasm.url, manifestUrl))).arrayBuffer();
    const dataset = { schemaVersion: 1, version: 'ambiguous-selector', sources: {}, coverage: {}, provinces: [{ code: 'AA', name: 'Test province', aliases: [] }],
      places: ['A001', 'A002'].map((belfioreCode, index) => ({ id: String(index), sourceId: 'fixture', sourceRecordId: String(index),
        name: 'SAN TEST', aliases: [], kind: 'municipality', status: 'active', belfioreCode, istatCode: null, province: 'AA', validFrom: '1900-01-01', validTo: null })) };
    const engine = await createValiCore({ distribution: { mode: 'custom', manifest: { ...manifest, datasets: { geo: { ...manifest.datasets.geo, version: dataset.version } } }, wasm, datasets: { geo: dataset } } });
    const container = document.createElement('div');
    container.innerHTML = '<input type="date" value="2000-01-01"><input value="AA" list="province-original" autocomplete="on"><input value="SAN TEST">';
    document.body.append(container);
    const [date, province, municipality] = container.querySelectorAll<HTMLInputElement>('input');
    const selector = attachPlaceSelector({ engine, date, province, municipality });
    const ambiguous = selector.resolve().status;
    const options = [...container.querySelectorAll<HTMLOptionElement>('datalist[id^="valicore-places"] option')].map(option => option.value);
    const selected = [];
    for (const label of options) {
      municipality.value = label; municipality.dispatchEvent(new Event('input'));
      selected.push(selector.value?.belfioreCode);
    }
    province.value = 'Unknown province'; province.dispatchEvent(new Event('input'));
    const invalid = { validity: province.validationMessage, selected: selector.value };
    province.value = 'AA'; province.dispatchEvent(new Event('input'));
    municipality.value = 'SAN TEST'; municipality.dispatchEvent(new Event('input'));
    const recovered = { validity: province.validationMessage, status: selector.resolve().status };
    selector.dispose();
    const restored = { list: province.getAttribute('list'), autocomplete: province.getAttribute('autocomplete'), datalists: container.querySelectorAll('datalist').length };
    engine.dispose(); container.remove(); urls.forEach(url => URL.revokeObjectURL(url));
    return { ambiguous, options, selected, invalid, recovered, restored };
  }, { index, ui });
  expect(result.ambiguous).toBe('ambiguous');
  expect(result.options).toHaveLength(2);
  expect(new Set(result.options).size).toBe(2);
  expect(result.selected.sort()).toEqual(['A001', 'A002']);
  expect(result.invalid.validity).toContain('Select a province');
  expect(result.invalid.selected).toBeNull();
  expect(result.recovered).toEqual({ validity: '', status: 'ambiguous' });
  expect(result.restored).toEqual({ list: 'province-original', autocomplete: 'on', datalists: 0 });
});

test('generation of a female foreign birthplace and inverse UI keeps decoded sex and country', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#calculate-form [name="birthDate"]').fill('2000-02-29');
  await page.locator('#calculate-form [name="sex"]').selectOption('F');
  await page.locator('#birth-province').fill('EE');
  await page.locator('#birthplace').fill('Francia');
  await page.locator('#birthplace').fill('FRANCIA · EE');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  const code = await page.getByTestId('fiscal-code').textContent();
  expect(code).toMatch(/^RSSMRA00B69Z110[A-Z]$/);
  await page.getByRole('tab', { name: 'Validate & decode' }).click();
  await page.locator('#inspect-form [name="code"]').fill(code!);
  await page.locator('#inspect-form [name="fromYear"]').fill('1900');
  await page.locator('#inspect-form [name="toYear"]').fill('2100');
  await page.getByRole('button', { name: 'Validate & decode' }).click();
  await expect(page.locator('#inspect-result')).toContainText('2000-02-29');
  await expect(page.locator('#inspect-result')).toContainText('Sex: F');
  await expect(page.locator('#inspect-result')).toContainText('FRANCIA');
  await expect(page.locator('#inspect-result')).not.toContainText('1900-02-29');
});
