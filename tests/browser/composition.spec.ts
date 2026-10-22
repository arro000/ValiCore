import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import valicore from '../../packages/js/tooling/vite.js';

for (const scenario of [
  { label: 'fiscal profile', options: { profile: 'fiscal' }, components: ['fiscal'], geography: false },
  { label: 'complete default', options: undefined, components: ['fiscal', 'geo'], geography: true },
]) test(`Vite ${scenario.label} actually initializes in Chromium without a public channel`, async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'valicore-browser-profile-'));
  const output = join(root, 'dist');
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = resolve(output, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (relative(output, path).startsWith('..')) { response.writeHead(403).end(); return; }
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
      response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
  });
  try {
    await writeFile(join(root, 'index.html'), '<!doctype html><script type="module" src="/main.js"></script>');
    await writeFile(join(root, 'main.js'), `
      import { createValiCore } from 'virtual:valicore';
      window.result = (async () => {
        const engine = await createValiCore();
        let result;
        try {
          result = { components: engine.versionInfo().components,
            code: engine.encode({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } }),
            geography: engine.capabilities().geoHistorical,
            historicalProvince: engine.capabilities().geoHistorical ? engine.resolvePlace({ name: 'Cattolica', onDate: '1985-03-15' }).candidates[0].province : null };
        } finally { engine.dispose(); }
        const without = await createValiCore({ catalog: false });
        try { result.disabledDataVersion = without.versionInfo().dataVersion; }
        finally { without.dispose(); }
        return result;
      })();
    `);
    await build({ root, plugins: [valicore(scenario.options)], logLevel: 'silent',
      resolve: { alias: { '@arro000/valicore': fileURLToPath(new URL('../../packages/js/src/index.js', import.meta.url)) } },
      build: { outDir: output, rollupOptions: { input: join(root, 'index.html') } } });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const origin = `http://127.0.0.1:${address.port}`;
    const requests: string[] = [];
    await page.route('**/*', route => {
      requests.push(route.request().url());
      return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin);
    await page.waitForFunction(() => 'result' in window);
    const result = await page.evaluate(() => (window as unknown as { result: Promise<unknown> }).result);
    expect(result).toEqual({ components: scenario.components, code: 'RSSMRA85C15H501R', geography: scenario.geography,
      historicalProvince: scenario.geography ? 'FO' : null, disabledDataVersion: null });
    expect(requests.every(url => new URL(url).origin === origin)).toBe(true);
    expect(requests.filter(url => new URL(url).pathname.endsWith('.wasm')).length).toBeGreaterThan(0);
    expect(requests.some(url => /(?:places|geo)\.json/.test(url))).toBe(scenario.geography);
  } finally {
    await page.unroute('**/*');
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    }
    await rm(root, { recursive: true, force: true });
  }
});
