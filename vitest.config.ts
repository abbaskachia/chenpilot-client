import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
      thresholds: {
        'src/services/**': { lines: 15, functions: 15, branches: 10, statements: 15 },
        'src/store/**': { lines: 20, functions: 20, branches: 15, statements: 20 },
        'src/utils/**': { lines: 15, functions: 15, branches: 10, statements: 15 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
});
