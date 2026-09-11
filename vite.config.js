import { defineConfig } from 'vite';
import { resolve } from 'path';

// NHL data comes from the Cloudflare nhl-gateway (VITE_NHL_GATEWAY_URL, default
// https://nhl-api.propbetedge.ai); Vercel serves only this static build.
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: true, target: 'es2020' }
});
