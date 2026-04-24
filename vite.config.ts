/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    // Only collect Vitest unit tests from src/. Playwright specs live under
    // tests/e2e/ and use their own runner.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/e2e'],
  },
});
