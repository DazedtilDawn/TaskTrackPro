import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/tests/setup.ts'],
    include: ['server/tests/**/*.test.ts'],
    deps: {
      inline: ['vitest-environment-node'],
    },
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
}); 