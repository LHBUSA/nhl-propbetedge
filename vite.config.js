import { defineConfig } from 'vite';
import { resolve } from 'path';

// NHL data comes from the Cloudflare nhl-gateway (VITE_NHL_GATEWAY_URL, default
// https://nhl-api.propbetedge.ai); Vercel serves only this static build.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  // Two real pages: the app (index.html) and the native All Access page
  // (all-access.html, served at /all-access by vercel.json's one rewrite).
  build: {
    outDir: 'dist', sourcemap: true, target: 'es2020',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), allAccess: resolve(__dirname, 'all-access.html') } }
  }
});
