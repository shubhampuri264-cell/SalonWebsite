import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@luxe/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
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
