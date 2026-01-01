import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: [
      'src/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**', 'node_modules/**'],
    },
  },
});
