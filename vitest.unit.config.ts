import { defineConfig } from 'vitest/config';

// Unit tests only: no database needed.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'] },
});
