import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8')) as { version: string };

// The repository and licence live on the workspace root, which is the one
// package.json that describes the project rather than this half of it. Read
// rather than repeated here, so the About page cannot drift from the manifest.
const root = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf-8')) as {
  repository?: { url?: string };
  license?: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_REPOSITORY__: JSON.stringify(root.repository?.url ?? ''),
    __APP_LICENSE__: JSON.stringify(root.license ?? ''),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
