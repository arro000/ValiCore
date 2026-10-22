import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

export default defineConfig({
  base: process.env.DEMO_BASE ?? './',
  plugins: [{
    name: 'local-distribution',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (!pathname.startsWith('/ValiCore/dist/') && !pathname.startsWith('/dist/')) return next();
        const relative = pathname.replace(/^\/(?:ValiCore\/)?dist\//, '');
        const directory = resolve(import.meta.dirname, '../../distribution');
        const path = resolve(directory, relative);
        if (!path.startsWith(`${directory}/`)) { response.statusCode = 403; return response.end(); }
        try {
          const bytes = await readFile(path);
          response.setHeader('Content-Type', extname(path) === '.wasm' ? 'application/wasm' : 'application/json');
          response.setHeader('Access-Control-Allow-Origin', '*');
          response.end(bytes);
        } catch { response.statusCode = 404; response.end('Run npm run build:artifacts first.'); }
      });
    },
  }],
});
