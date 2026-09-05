import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // bin/call-tool.mjs is deliberately excluded — it only ever runs as a spawned child
      // process in the e2e suite (see test/e2e/*), and v8's coverage collector can't attribute
      // execution across a process boundary back to this run, so it would always show as a
      // misleading 0% despite being exercised.
      include: ['src/**/*.ts'],
    },
  },
});
