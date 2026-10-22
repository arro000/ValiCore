import { test, expect } from '@playwright/test';

test('browser initialization uses the explicit gzip assets and verifies the decoded dataset', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  expect(requests.some(path => path.endsWith('/places.json.gz'))).toBe(true);
  expect(requests.some(path => path.endsWith('/engine.wasm.gz'))).toBe(true);
  expect(requests.some(path => path.endsWith('/places.json'))).toBe(false);
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15H501R');
});

test('browsers without application gzip decompression use the original URLs with HTTP compression', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'DecompressionStream', { configurable: true, value: undefined });
  });
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/places.json'));
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const response = await responsePromise;
  expect(['br', 'gzip']).toContain(response.headers()['content-encoding']);
  expect(response.headers()['cache-control']).toContain('immutable');
  expect(requests.some(path => path.endsWith('.gz'))).toBe(false);
  await page.getByRole('button', { name: 'Calculate fiscal code' }).click();
  await expect(page.getByTestId('fiscal-code')).toHaveText('RSSMRA85C15H501R');
});
