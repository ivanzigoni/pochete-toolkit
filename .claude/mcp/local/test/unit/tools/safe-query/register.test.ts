import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { QueryResult } from '../../../../src/tools/safe-query/types.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';

const { runQueryMock } = vi.hoisted(() => ({ runQueryMock: vi.fn() }));
vi.mock('../../../../src/tools/safe-query/query.js', () => ({ runQuery: runQueryMock }));

// Overrides only the connection profile lookup with fixture data — resolveConnectionPassword
// stays real (it still needs the real, gitignored connection-profiles.json's passwordEnvVar
// field), but resolveConnectionProfile/CONNECTION_PROFILE_KEYS never surface this test's real
// host/user as a literal here; see connection-profiles.test.ts's FAKE_REGISTRY for the same fixture.
vi.mock('../../../../src/tools/safe-query/connection-profiles.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/tools/safe-query/connection-profiles.js')>();
  return {
    ...actual,
    CONNECTION_PROFILE_KEYS: ['cemiterio_dev', 'cemiterio_prd'],
    resolveConnectionProfile: (key: string) =>
      ({
        cemiterio_dev: {
          engine: 'mssql',
          host: 'db-dev.example.internal',
          port: 1433,
          database: 'Cemiterio_DEV',
          user: 'example_user',
          ssl: false,
          trustServerCert: false,
        },
        cemiterio_prd: {
          engine: 'mssql',
          host: 'db.example.internal',
          port: 1433,
          database: 'Cemiterio',
          user: 'example_user',
          ssl: false,
          trustServerCert: false,
        },
      })[key],
  };
});

const { registerSafeQueryTool } = await import('../../../../src/tools/safe-query/register.js');

const ENV_FILE_VAR = 'CEM_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

const DEFAULT_VARS = {
  SAFE_QUERY_CEM_HML_PASSWORD: 'fakepass',
};

// EnvConfig reads .env fresh per instantiation, never process.env — so a test that wants
// non-default config points CEM_MCP_ENV_FILE at its own temp file via this helper instead of
// mutating process.env directly. Omitting a key here means "absent from the file" (the same as
// deleting it used to mean); pass '' explicitly to simulate "configured but blank".
async function setEnvFile(overrides: Record<string, string> = {}): Promise<void> {
  const { path: envPath, cleanup } = await writeTempEnvFile({ ...DEFAULT_VARS, ...overrides });
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
}

beforeEach(async () => {
  await setEnvFile();
  runQueryMock.mockReset();
});

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrentEnvFile?.();
  cleanupCurrentEnvFile = undefined;
});

async function createConnectedClient(): Promise<Client> {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerSafeQueryTool(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('registerSafeQueryTool', () => {
  it('resolves the given connection profile and returns the query result as JSON', async () => {
    const queryResult: QueryResult = { fields: ['a'], rows: [{ a: 1 }] };
    runQueryMock.mockResolvedValueOnce(queryResult);
    const client = await createConnectedClient();

    const result = await client.callTool({
      name: 'safe-query',
      arguments: { query: 'SELECT 1 AS a', connection: 'cemiterio_dev' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text);
    expect(payload).toMatchObject({
      connection: 'cemiterio_dev',
      engine: 'mssql',
      host: 'db-dev.example.internal',
      database: 'Cemiterio_DEV',
      columns: ['a'],
      rowCount: 1,
      totalRowCount: 1,
      truncated: false,
      rows: [{ a: 1 }],
    });
    expect(typeof payload.durationMs).toBe('number');
    expect(() => new Date(payload.executedAt).toISOString()).not.toThrow();
    expect(runQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ engine: 'mssql', host: 'db-dev.example.internal' }),
      'SELECT 1 AS a',
    );
  });

  it('reports a clear error and never calls runQuery when the password env var is unset', async () => {
    await setEnvFile({ SAFE_QUERY_CEM_HML_PASSWORD: '' });
    const client = await createConnectedClient();

    const result = await client.callTool({
      name: 'safe-query',
      arguments: { query: 'SELECT 1', connection: 'cemiterio_dev' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toContain('SAFE_QUERY_CEM_HML_PASSWORD');
    expect(content[0]!.text).toContain('is not set');
    expect(runQueryMock).not.toHaveBeenCalled();
  });

  it('rejects a write statement before ever resolving a connection or calling runQuery', async () => {
    const client = await createConnectedClient();

    const result = await client.callTool({
      name: 'safe-query',
      arguments: { query: 'DELETE FROM t', connection: 'cemiterio_dev' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toContain('only SELECT (or WITH ... SELECT) statements are allowed');
    expect(runQueryMock).not.toHaveBeenCalled();
  });

  it('surfaces a runQuery rejection as an error result rather than throwing', async () => {
    runQueryMock.mockRejectedValueOnce(new Error('connection refused'));
    const client = await createConnectedClient();

    const result = await client.callTool({
      name: 'safe-query',
      arguments: { query: 'SELECT 1', connection: 'cemiterio_dev' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toBe('connection refused');
  });

  it('truncates rows to SAFE_QUERY_MAX_ROWS and reports totalRowCount/truncated accordingly', async () => {
    await setEnvFile({ SAFE_QUERY_MAX_ROWS: '1' });
    runQueryMock.mockResolvedValueOnce({
      fields: ['a'],
      rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
    });
    const client = await createConnectedClient();

    const result = await client.callTool({
      name: 'safe-query',
      arguments: { query: 'SELECT a FROM t', connection: 'cemiterio_dev' },
    });

    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text);
    expect(payload.rowCount).toBe(1);
    expect(payload.totalRowCount).toBe(3);
    expect(payload.truncated).toBe(true);
    expect(payload.rows).toEqual([{ a: 1 }]);
  });

  it('masks LGPD-sensitive columns in the returned rows', async () => {
    runQueryMock.mockResolvedValueOnce({
      fields: ['id', 'CPF', 'Religiao'],
      rows: [{ id: 1, CPF: '12345678900', Religiao: 'Catolica' }],
    });
    const client = await createConnectedClient();

    const result = await client.callTool({
      name: 'safe-query',
      arguments: { query: 'SELECT id, CPF, Religiao FROM Associados', connection: 'cemiterio_dev' },
    });

    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0]!.text);
    expect(payload.rows).toEqual([{ id: 1, CPF: '12***', Religiao: '***' }]);
  });

  describe('outputFileName', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const toolOutputDir = path.join(testDir, '..', '..', '..', '..', '.tool-output', 'safe-query');

    afterEach(async () => {
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full payload to disk and returns a summary without rows when given', async () => {
      runQueryMock.mockResolvedValueOnce({ fields: ['a'], rows: [{ a: 1 }, { a: 2 }] });
      const client = await createConnectedClient();

      const result = await client.callTool({
        name: 'safe-query',
        arguments: { query: 'SELECT a FROM t', outputFileName: 'result.json', connection: 'cemiterio_dev' },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as { type: string; text: string }[];
      const summary = JSON.parse(content[0]!.text);
      expect(summary.written).toBe(true);
      expect(summary.rowCount).toBe(2);
      expect(summary).not.toHaveProperty('rows');
      expect(summary.outputPath.endsWith(path.join('safe-query', 'result.json'))).toBe(true);
    });

    it('still returns the full payload inline when outputFileName is omitted', async () => {
      runQueryMock.mockResolvedValueOnce({ fields: ['a'], rows: [{ a: 1 }] });
      const client = await createConnectedClient();

      const result = await client.callTool({
        name: 'safe-query',
        arguments: { query: 'SELECT a FROM t', connection: 'cemiterio_dev' },
      });

      const content = result.content as { type: string; text: string }[];
      const payload = JSON.parse(content[0]!.text);
      expect(payload.rows).toEqual([{ a: 1 }]);
      expect(payload).not.toHaveProperty('written');
    });
  });
});
