import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, whose root is the viewer: tests live in both
// src/ and viewer/src/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'viewer/src/**/*.test.ts'],
  },
});
