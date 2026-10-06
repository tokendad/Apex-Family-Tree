import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // Only run tests from source. `npm run build` emits compiled copies of every
    // test file into dist/, and without this they are collected too — so the
    // suite ran each test twice, and the dist copies went stale the moment a
    // source test changed without a rebuild. A test whose source had already
    // been deleted (services/mediaPath) was still running from dist/ as well.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
