import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/tests/setup.ts'],
    include: ['server/tests/**/*.test.ts'],
    deps: {
      optimizer: {
        web: {
          include: []
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    passWithNoTests: false,
    logHeapUsage: true,
    reporters: ['verbose'],
    sequence: { shuffle: false }
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, './server') },
      { find: '@db', replacement: resolve(__dirname, './db') }
    ]
  }
}); 