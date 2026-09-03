#!/usr/bin/env node
// Stand-in for the real railway CLI binary in e2e tests (test/e2e/railway-safe-cli.test.ts) —
// pointed at via RAILWAY_CLI_PATH in a temp .env, never the real binary. Echoes its own argv and
// the RAILWAY_TOKEN/RAILWAY_API_TOKEN it received as JSON on stdout, so the test can assert on
// exactly what exec.ts (src/tools/railway-safe-cli/exec.ts) built and injected. Exits non-zero
// when "--fail" is among its args, to exercise the non-zero-exit-code path without needing a
// binary that can genuinely fail.
const argv = process.argv.slice(2);

if (argv.includes('--fail')) {
  process.stderr.write('simulated railway CLI failure\n');
  process.exit(7);
}

process.stdout.write(
  JSON.stringify({
    argv,
    RAILWAY_TOKEN: process.env.RAILWAY_TOKEN ?? null,
    RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN ?? null,
  }),
);
