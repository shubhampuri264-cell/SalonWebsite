import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite 6+ loads this config as native ESM, where CJS __dirname does not exist.
const configDir = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(configDir, '..'),
  resolve: {
    alias: {
      '@': path.resolve(configDir, './src'),
      '@luxe/shared': path.resolve(configDir, '../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // `vercel dev` serves the api/ functions on :3000. Proxying /api through
    // Vite keeps the browser on a single origin in dev, which is what makes dev
    // match production: there, client and API are the same Vercel project and
    // every request is same-origin. Without this you either need CORS headers
    // that production doesn't have, or an absolute API URL baked into the dev
    // bundle — both of which mean dev exercises a different code path than
    // prod. Point it elsewhere with VERCEL_DEV_ORIGIN if you change the port.
    proxy: {
      '/api': {
        target: process.env.VERCEL_DEV_ORIGIN ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split only the large, eagerly-imported shared libraries into their
        // own long-cached chunks so they download in parallel and survive app
        // redeploys in the browser cache. Deliberately NOT a node_modules
        // catch-all: a generic "vendor" chunk would drag route-only deps
        // (react-day-picker, react-hook-form, zod — used solely by /book)
        // into the critical path. Everything else keeps Rollup's per-route
        // splitting.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@sentry')) return 'sentry';
          if (id.includes('@supabase')) return 'supabase';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('react-router') ||
            id.includes('react-helmet')
          ) {
            return 'react-core';
          }
        },
      },
    },
  },
});
