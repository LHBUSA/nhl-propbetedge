import { defineConfig } from 'vite';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

// Dev-only: serve /api/* through the same handlers Vercel runs, via a tiny
// req/res shim. Production builds never include this.
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const match = url.pathname.match(/^\/api\/([a-z-]+)$/);
        if (!match) return next();
        try {
          const file = pathToFileURL(resolve(__dirname, 'api', `${match[1]}.js`)).href;
          const mod = await import(`${file}?t=${Date.now()}`);
          const shim = {
            status(code) { res.statusCode = code; return this; },
            setHeader(key, value) { res.setHeader(key, value); return this; },
            json(obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); },
            send(body) { res.end(body); }
          };
          await mod.default({ method: req.method, query: Object.fromEntries(url.searchParams), headers: req.headers }, shim);
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
        }
      });
    }
  };
}

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  plugins: [vercelApiDev()],
  build: { outDir: 'dist', sourcemap: true, target: 'es2020' }
});
