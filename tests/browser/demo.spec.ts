import { test, expect } from '@playwright/test';

test('real runtime supports calculation, validation, omocodia, and historical lookup', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15H501R');
  await page.getByRole('tab', { name: 'Validate & decode' }).click();
  await page.getByRole('button', { name: 'Validate & decode' }).click();
  await expect(page.locator('#inspect-result')).toContainText('All applicable checks passed');
  await expect(page.locator('#inspect-result')).toContainText('century is ambiguous');
  await page.getByRole('tab', { name: 'Omocodia' }).click();
  await page.getByRole('button', { name: 'Explore variants' }).click();
  await expect(page.locator('#omocodia-result')).toContainText('Variant 1');
  await page.getByRole('tab', { name: 'Place explorer' }).click();
  await page.getByRole('button', { name: 'Search the archive' }).click();
  await expect(page.locator('#places-result')).toContainText('CASTEGNERO NANTO');
  await expect(page.locator('#places-result')).toContainText('ceased');
  expect(errors).toEqual([]);
});

test('mobile layout and invalid-code report remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByRole('tab', { name: 'Validate & decode' }).click();
  await page.locator('#inspect-form [name="code"]').fill('RSSMRA85B31H501B');
  await page.getByRole('button', { name: 'Validate & decode' }).click();
  await expect(page.locator('#inspect-result')).toContainText('A check failed');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('static preview works at the server root with compiled JavaScript and CSS', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(message.text());
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/demo\/$/);
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page.locator('.citizen-workspace')).toHaveCSS('border-radius', '10px');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15H501R');
  expect(failures).toEqual([]);
});

test('historical birthplace selection survives input events and follows birth-date changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const birthplace = page.locator('#birthplace');
  const birthDate = page.locator('#calculate-form [name="birthDate"]');
  await page.locator('#birth-province').fill('Forli');
  await birthplace.fill('Cattolica');
  await expect(page.locator('#calculate-form datalist[id^="valicore-places"] option').first()).toHaveAttribute('value', 'CATTOLICA · FO');
  // Datalist selection dispatches the same input event as entering its value.
  await birthplace.fill('CATTOLICA · FO');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15C357C');
  await expect(page.locator('#calculate-result')).toContainText('CATTOLICA · FO');
  await birthDate.fill('1992-04-15');
  await expect(birthplace).toHaveValue('CATTOLICA · FO');
  await birthDate.fill('1992-04-16');
  await expect(birthplace).toHaveValue('CATTOLICA · RN');
  await expect(page.locator('#birth-province')).toHaveValue('Rimini (RN)');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.locator('#calculate-result')).toContainText('CATTOLICA · RN');
  await expect(page.locator('#calculate-result')).not.toHaveClass(/error/);
  await birthDate.fill('1985-03-15');
  await expect(birthplace).toHaveValue('CATTOLICA · FO');
  await page.locator('#birth-province').fill('Agrigento');
  await birthplace.fill('Cattolica Eraclea');
  await birthplace.fill('CATTOLICA ERACLEA · AG');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.locator('#calculate-result')).toContainText('CATTOLICA ERACLEA · AG');
  expect(errors).toEqual([]);
});

test('a changed birth date cannot reuse a municipality code before its institution', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const birthplace = page.locator('#birthplace');
  const birthDate = page.locator('#calculate-form [name="birthDate"]');
  await birthDate.fill('2026-02-21');
  await page.locator('#birth-province').fill('Vicenza');
  await birthplace.fill('Castegnero Nanto');
  await birthplace.fill('CASTEGNERO NANTO · VI');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.locator('#calculate-result')).not.toHaveClass(/error/);
  await birthDate.fill('1985-03-15');
  await expect(birthplace).toHaveValue('CASTEGNERO NANTO');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.locator('#calculate-result')).toContainText('UNKNOWN_PLACE');
});

test('reusable selector works without personal details and filters province/date', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByRole('tab', { name: 'Place selector', exact: true }).click();
  await expect(page.locator('#selector-result')).toContainText('CATTOLICA');
  await expect(page.locator('#selector-result')).toContainText('C357 · FO');
  await page.locator('#selector-date').fill('1993-03-15');
  await expect(page.locator('#selector-province')).toHaveValue('Rimini (RN)');
  await expect(page.locator('#selector-result')).toContainText('C357 · RN');
  await page.locator('#selector-province').fill('Roma');
  await expect(page.locator('#selector-municipality')).toHaveValue('');
  await page.locator('#selector-municipality').fill('Cattolica');
  await expect(page.locator('#selector-panel datalist[id^="valicore-places"] option')).toHaveCount(0);
  await page.locator('#selector-municipality').fill('Roma');
  await page.locator('#selector-municipality').fill('ROMA · RM');
  await expect(page.locator('#selector-result')).toContainText('H501 · RM');
  await page.locator('#selector-province').fill('Foreign countries (EE)');
  await page.locator('#selector-municipality').fill('Francia');
  await page.locator('#selector-municipality').fill('FRANCIA · EE');
  await expect(page.locator('#selector-result')).toContainText('Z110 · EE');
  // A programmatic example reset must discard the previous selected record.
  await page.getByRole('tab', { name: 'Calculate', exact: true }).click();
  await page.locator('#birth-province').fill('Forlì (FO)');
  await page.locator('#birthplace').fill('Cattolica');
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15H501R');
});

test('province autocomplete searches names and abbreviations in the selected date', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const province = page.locator('#birth-province');
  const options = page.locator('#calculate-form datalist[id^="valicore-provinces"] option');
  await province.fill('for');
  await expect(page.locator('#calculate-form datalist[id^="valicore-provinces"] option[value="Forlì (FO)"]')).toHaveCount(1);
  await province.fill('FO');
  await page.locator('#birthplace').fill('Cattolica');
  await page.locator('#birthplace').fill('CATTOLICA · FO');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15C357C');
  await province.fill('Rimini');
  await expect(options).toHaveCount(0);
  await expect(province).toHaveJSProperty('validationMessage', 'Select a province name or abbreviation available for the reference date.');
  await page.locator('#calculate-form [name="birthDate"]').fill('2026-03-15');
  await province.fill('for');
  await expect(page.locator('#calculate-form datalist[id^="valicore-provinces"] option[value="Forlì-Cesena (FC)"]')).toHaveCount(1);
  await province.fill('Forlì-Cesena (FC)');
  await page.locator('#birthplace').fill('Forli');
  await expect(page.locator('#calculate-form datalist[id^="valicore-places"] option').first()).toHaveAttribute('value', 'FORLÌ · FC');
});

test('Sardinian selector follows the 2026 reform and dated province names', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByRole('tab', { name: 'Place selector', exact: true }).click();
  const date = page.locator('#selector-date');
  const province = page.locator('#selector-province');
  const municipality = page.locator('#selector-municipality');
  await date.fill('2025-12-31');
  await province.fill('Sassari');
  await municipality.fill('Olbia');
  await municipality.fill('OLBIA · SS');
  await expect(page.locator('#selector-result')).toContainText('G015');
  await date.fill('2026-01-01');
  await expect(province).toHaveValue('Gallura Nord-Est Sardegna (OT)');
  await expect(municipality).toHaveValue('Olbia · OT');
  await expect(page.locator('#selector-result')).toContainText('113017');
  await expect(page.locator('#selector-result')).toContainText('G015');
  await date.fill('2010-01-01');
  await expect(province).toHaveValue('Olbia-Tempio (OT)');
  await expect(page.locator('#selector-result')).toContainText('G015');
});

test('browser wrapper can load the channel from a different origin', async ({ page }) => {
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const channel = 'http://localhost:4173/ValiCore/dist/channels/v1/latest.json';
  const response = await page.evaluate(async url => {
    const manifest = await (await fetch(url)).json();
    const wasm = await (await fetch(new URL(manifest.runtime.wasm.url, url))).arrayBuffer();
    const dataset = await (await fetch(new URL(manifest.datasets.geo.url, url))).json();
    const instance = await WebAssembly.instantiate(wasm, {});
    return { protocol: manifest.loaderProtocol, hasInvoke: typeof instance.instance.exports.valicore_invoke === 'function', matchesDataset: dataset.version === manifest.datasets.geo.version };
  }, channel);
  expect(response).toEqual({ protocol: 2, hasInvoke: true, matchesDataset: true });
});
