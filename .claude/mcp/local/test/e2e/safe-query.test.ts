// Covers the safe-query tool end-to-end through the real MCP server process — connection
// resolution (env-var wiring), the missing-credential error path, and the tool-call boundary
// (JSON in over stdin, JSON out over stdout) — the coverage that used to live in the skill's own
// _tests/safe-query.bats before that CLI wrapper was removed in favor of calling this tool
// directly. validate.ts's own SELECT-only logic has its exhaustive case list in
// unit/tools/safe-query/validate.test.ts; the equivalent cases are exercised here only enough to
// confirm they still surface correctly through the full tool-call path, not to re-enumerate them.
//
// Every test spawns a fresh instance of the real server (via bin/call-tool.mjs -> run.sh -> tsx)
// with `pg`/`mssql` swapped for the in-memory fakes under test/fixtures/ (no real database), and
// with the connection details written to an isolated temp .env file (test/helpers/env-file.ts)
// that the child is pointed at via CEM_MCP_ENV_FILE — never the real .env, never process.env
// directly (EnvConfig, src/shared/env-config.ts, reads neither). A case that needs a var to look
// unset passes '' for it explicitly rather than omitting it — omitting a key means "absent from
// the file", passing '' means "present but blank"; EnvConfig's required-field check treats both
// the same way, but only '' is actually exercising that path deliberately.
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CALL_TOOL_MJS = path.join(SERVER_ROOT, 'bin', 'call-tool.mjs');
const REGISTER_FAKE_DRIVERS = path.join(
  SERVER_ROOT,
  'test',
  'fixtures',
  'register-fake-drivers.mjs',
);

const ENV: Record<string, string> = {
  SAFE_QUERY_CEM_HML_PASSWORD: 'testpass',
};

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function callSafeQuery(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup } = await writeTempEnvFile(envOverrides);
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(REGISTER_FAKE_DRIVERS).href}`,
        CEM_MCP_ENV_FILE: envFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'safe-query'], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));

      child.stdin.write(JSON.stringify({ connection: 'cemiterio_dev', ...toolArguments }));
      child.stdin.end();
    });
  } finally {
    await cleanup();
  }
}

describe('safe-query (via call-tool.mjs against the real MCP server)', () => {
  it('runs a query against the "cemiterio_dev" connection', async () => {
    const { stdout, exitCode } = await callSafeQuery({ query: 'SELECT 1 AS one' }, ENV);
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.connection).toBe('cemiterio_dev');
    expect(payload.engine).toBe('mssql');
    expect(payload.rows).toEqual([{ one: 1 }]);
  });

  it('rejects the connection if its password var is missing', async () => {
    const { stderr, exitCode } = await callSafeQuery(
      { query: 'SELECT 1' },
      { ...ENV, SAFE_QUERY_CEM_HML_PASSWORD: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('SAFE_QUERY_CEM_HML_PASSWORD');
    expect(stderr).toContain('is not set');
  });

  it('rejects an unregistered connection', async () => {
    const { stderr, exitCode } = await callSafeQuery(
      { query: 'SELECT 1', connection: 'not-a-real-connection' },
      ENV,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('connection');
  });

  it.each([
    {
      name: 'a write statement',
      query: 'DELETE FROM t',
      expectedError: 'only SELECT (or WITH ... SELECT) statements are allowed',
    },
    {
      name: 'a write hidden inside a CTE',
      query: 'WITH cte AS (DELETE FROM t RETURNING *) SELECT * FROM cte',
      expectedError: 'disallowed keyword detected: DELETE',
    },
    {
      name: 'more than one statement',
      query: 'SELECT 1; SELECT 2',
      expectedError: 'exactly one SQL statement is allowed, found 2',
    },
    { name: 'an empty query', query: '', expectedError: 'query is empty' },
  ])('rejects $name', async ({ query, expectedError }) => {
    const { stderr, exitCode } = await callSafeQuery({ query }, ENV);
    expect(exitCode).toBe(1);
    expect(stderr).toContain(expectedError);
  });

  it('passes Unicode/emoji content through intact', async () => {
    const { stdout, exitCode } = await callSafeQuery(
      { query: "SELECT 'wörld 🌍' AS greeting" },
      ENV,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).rows).toEqual([{ greeting: 'wörld 🌍' }]);
  });

  it('passes a query containing shell metacharacters through intact', async () => {
    const { stdout, exitCode } = await callSafeQuery(
      { query: "SELECT 'a; DROP TABLE x; --' AS one" },
      ENV,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).rows).toEqual([{ one: 'a; DROP TABLE x; --' }]);
  });

  it('truncates rows to SAFE_QUERY_MAX_ROWS and reports truncated: true', async () => {
    const { stdout, exitCode } = await callSafeQuery(
      { query: 'SELECT id, name FROM fake_users ORDER BY id' },
      { ...ENV, SAFE_QUERY_MAX_ROWS: '1' },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.rowCount).toBe(1);
    expect(payload.totalRowCount).toBe(3);
    expect(payload.truncated).toBe(true);
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'safe-query');

    afterEach(async () => {
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns a summary plus the path instead', async () => {
      const { stdout, exitCode } = await callSafeQuery(
        { query: 'SELECT id, name FROM fake_users ORDER BY id', outputFileName: 'e2e-result.json' },
        ENV,
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.rowCount).toBe(3);
      expect(summary.rows).toBeUndefined();

      const written = JSON.parse(await readFile(summary.outputPath, 'utf8'));
      expect(written.rows).toHaveLength(3);
    });

    it('rejects an outputFileName containing a path separator', async () => {
      const { stderr, exitCode } = await callSafeQuery(
        { query: 'SELECT 1', outputFileName: '../escape.json' },
        ENV,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('outputFileName');
    });
  });

  it('two concurrent calls each get an independent result', async () => {
    const [a, b] = await Promise.all([
      callSafeQuery({ query: 'SELECT 1 AS one' }, ENV),
      callSafeQuery({ query: 'SELECT 2 AS two' }, ENV),
    ]);
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(JSON.parse(a.stdout).rows).toEqual([{ one: 1 }]);
    expect(JSON.parse(b.stdout).rows).toEqual([{ two: 2 }]);
  });
});
