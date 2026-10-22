import { test, expect } from '@playwright/test';

test('ValiCore branding and beta package instructions use the current identity', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page).toHaveTitle('ValiCore — Calculate & decode');
  await expect(page.getByRole('link', { name: 'ValiCore home' })).toContainText('ValiCore');
  await expect(page.locator('.brand-mark')).toHaveText('VC');
  await expect(page.locator('.card-heading')).toContainText('ValiCore');
  await expect(page.locator('footer')).toContainText('ValiCore');
  await expect(page.locator('#example-code')).toContainText('createValiCore');
  await expect(page.locator('#example-code')).toContainText('@arro000/valicore');
  await expect(page.getByRole('link', { name: 'Build the beta package' })).toHaveAttribute('href', 'https://github.com/arro000/ValiCore#use-it');
  await expect(page.locator('.install-context')).not.toContainText('Download');
});

test('card reflects generation, clears stale codes and passes the result to inverse calculation', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page.locator('#health-card')).toContainText('NOT AN OFFICIAL DOCUMENT');
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.locator('#card-code')).toHaveText('RSSMRA85C15H501R');
  await page.locator('#calculate-form [name="name"]').fill('Maria');
  await expect(page.locator('#card-name')).toHaveText('MARIA');
  await expect(page.locator('#card-code')).not.toHaveText('RSSMRA85C15H501R');
  await expect(page.locator('#calculate-result')).toBeHidden();
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await page.getByRole('button', { name: 'Decode this code' }).click();
  await expect(page.locator('#inspect-result')).toContainText('1985-03-15');
  await expect(page.locator('#inspect-result')).not.toContainText('2085-03-15');
  await expect(page.locator('.date-candidate').first()).toContainText('Birthplace records for 1985-03-15');
  await expect(page.locator('.date-candidate .places-list').first()).not.toContainText('1902-03-10');
  await expect(page.locator('#inspect-tab')).toHaveAttribute('aria-selected', 'true');
});

test('features open real playground operations and language examples are copyable', async ({ page }) => {
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
  });
  await page.getByRole('button', { name: 'Person matching Compare every encoded component' }).click();
  await page.getByRole('button', { name: 'Compare person' }).click();
  await expect(page.locator('#match-result')).toContainText('Encoded components match');
  await page.locator('#match-form [name="surname"]').fill('Bianchi');
  await page.getByRole('button', { name: 'Compare person' }).click();
  await expect(page.locator('#match-result')).toContainText('surname');
  await page.getByRole('button', { name: 'TypeScript', exact: true }).click();
  await expect(page.locator('#example-code')).toContainText('type MatchReport');
  await expect(page.locator('#example-code')).toContainText('const person: Person');
  await page.locator('#copy-example').click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toContain('const result: MatchReport');
  await page.locator('#copy-install').click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe('npm install ./arro000-valicore-0.5.0-beta.1.tgz');
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
  await expect(page.locator('#example-code')).not.toContainText('type MatchReport');
  await page.getByRole('tab', { name: 'Name & checksum' }).click();
  await page.locator('#utilities-form [name="operation"]').selectOption('checksum');
  await page.getByRole('button', { name: 'Run operation' }).click();
  await expect(page.locator('#utilities-result .code-output')).toHaveText('R');
  await page.locator('#utilities-form [name="operation"]').selectOption('numericChecksum');
  await page.getByRole('button', { name: 'Run operation' }).click();
  await expect(page.locator('#utilities-result .code-output')).toHaveText('1');
});

test('independent keyboard tablists and reusable selector scenarios stay in sync', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#calculate-tab').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#inspect-panel')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.locator('#inspect-tab')).toBeFocused();
  await page.getByRole('tab', { name: 'Place selector', exact: true }).click();
  await page.getByRole('button', { name: 'Olbia · 2026' }).click();
  await expect(page.locator('#selector-result')).toContainText('G015 · OT');
  await expect(page.locator('#selector-province')).toHaveValue('Gallura Nord-Est Sardegna (OT)');
  await page.keyboard.press('Home');
  // The scenario button has focus; move to the tablist before navigation.
  await page.locator('#selector-tab').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#omocodia-tab')).toBeFocused();
  await expect(page.locator('#omocodia-panel')).toBeVisible();
  await expect(page.locator('#inspect-panel')).toBeVisible();
});

test('mobile navigation and integration examples never cause page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByRole('link', { name: 'Integrate the library', exact: true }).click();
  await page.getByRole('button', { name: 'TypeScript', exact: true }).click();
  for (const operation of ['calculate', 'inspect', 'omocodia', 'places', 'selector', 'match', 'utilities', 'distribution']) {
    await page.locator('#example-operation').selectOption(operation);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.getByRole('link', { name: 'Versioned runtime & data Online updates, pinned releases and offline bundles' }).click();
  await expect(page.locator('#distribution-doc')).toHaveAttribute('open', '');
});

test('failed runtime leaves example/docs controls working and calculations disabled', async ({ page }) => {
  await page.route('**/dist/channels/v1/latest.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Unable to initialize');
  await expect(page.getByRole('button', { name: 'Calculate fiscal code' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Load example' })).toBeDisabled();
  await page.getByRole('button', { name: 'TypeScript', exact: true }).click();
  await expect(page.locator('#example-code')).toContainText('const variants: string[]');
});
