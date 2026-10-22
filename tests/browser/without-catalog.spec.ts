import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../packages/js/src/index.js', import.meta.url), 'utf8');

test('browser algorithm-only loader never requests the catalog and reports unavailable territory', async ({ page }) => {
  await page.goto('/ValiCore/demo/');
  await expect(page.getByRole('status')).toContainText('Ready');
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.route('**/places.json*', route => route.fulfill({ status: 503, body: 'Catalog deliberately unavailable' }));
  const result = await page.evaluate(async source => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { createValiCore } = await import(url);
    const engine = await createValiCore({ catalog: false, distribution: {
      mode: 'online', channelUrl: new URL('/ValiCore/dist/channels/v1/latest.json', location.href).href,
      cache: false, fallback: false,
    } });
    try {
      const code = engine.encode({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } });
      let searchError;
      try { engine.searchPlaces('Roma'); } catch (error) { searchError = (error as { code: string }).code; }
      const report = engine.validate(code);
      return { code, capabilities: engine.capabilities(), dataVersion: engine.versionInfo().dataVersion,
        calendarValid: engine.validate(code, { level: 'calendar' }).valid,
        territorialValid: report.valid, territorialError: report.checks[3].error.code,
        dates: engine.decode(code, { yearRange: [1985, 1985] }).candidateDates, searchError,
        vatValid: engine.validateItalianVat('it06363391001').valid,
        vatInvalid: engine.validateItalianVat('06363391002').valid,
        vatRegistry: engine.validateItalianVat('00000000000').checks[2].status };
    } finally { engine.dispose(); URL.revokeObjectURL(url); }
  }, source);
  expect(result).toEqual({ code: 'RSSMRA85C15H501R', capabilities: { fiscalIdentity: true, geoHistorical: false },
    dataVersion: null, calendarValid: true, territorialValid: null, territorialError: 'CAPABILITY_UNAVAILABLE',
    dates: ['1985-03-15'], searchError: 'CAPABILITY_UNAVAILABLE',
    vatValid: true, vatInvalid: false, vatRegistry: 'not_run' });
  expect(requests.some(path => path.endsWith('/engine.wasm.gz'))).toBe(true);
  expect(requests.some(path => /places\.json/.test(path))).toBe(false);
});
