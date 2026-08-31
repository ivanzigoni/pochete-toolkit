import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionArgs } from '../../../../../src/tools/safe-query/types.js';

const { clientConfigMock, connectMock, queryMock, endMock } = vi.hoisted(() => ({
  clientConfigMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));

vi.mock('pg', () => {
  class FakeClient {
    connect = connectMock;

    query = queryMock;

    end = endMock;

    constructor(config: unknown) {
      clientConfigMock(config);
    }
  }
  return { Client: FakeClient };
});

const { runPostgres } = await import('../../../../../src/tools/safe-query/db/postgres.js');

function connectionArgs(overrides: Partial<ConnectionArgs> = {}): ConnectionArgs {
  return {
    engine: 'postgres',
    host: 'fake-host',
    port: 5432,
    database: 'fakedb',
    user: 'fakeuser',
    password: 'fakepass',
    timeoutSeconds: 30,
    ssl: false,
    trustServerCert: false,
    ...overrides,
  };
}

/** The 5 queries runPostgres always issues, in order: BEGIN, READ ONLY, statement_timeout, the
 * caller's query, then ROLLBACK — queued here as one resolved-value sequence per test. */
function queueControlAndResult(result: unknown): void {
  queryMock
    .mockResolvedValueOnce(undefined) // BEGIN
    .mockResolvedValueOnce(undefined) // SET TRANSACTION READ ONLY
    .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
    .mockResolvedValueOnce(result) // the caller's query
    .mockResolvedValueOnce(undefined); // ROLLBACK
}

beforeEach(() => {
  clientConfigMock.mockClear();
  connectMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset();
  endMock.mockReset().mockResolvedValue(undefined);
});

describe('runPostgres', () => {
  it('runs BEGIN, READ ONLY, and a statement_timeout ahead of the caller query, then rolls back and closes', async () => {
    queueControlAndResult({ fields: [{ name: 'a' }], rows: [{ a: 1 }] });

    const result = await runPostgres(connectionArgs({ timeoutSeconds: 5 }), 'SELECT 1 AS a');

    expect(result).toEqual({ fields: ['a'], rows: [{ a: 1 }] });
    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(2, 'SET TRANSACTION READ ONLY');
    expect(queryMock).toHaveBeenNthCalledWith(3, 'SET LOCAL statement_timeout = 5000');
    expect(queryMock).toHaveBeenNthCalledWith(4, 'SELECT 1 AS a');
    expect(queryMock).toHaveBeenNthCalledWith(5, 'ROLLBACK');
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('defaults fields to [] when the driver returns no fields', async () => {
    queueControlAndResult({ rows: [] });

    const result = await runPostgres(connectionArgs(), 'SELECT');

    expect(result).toEqual({ fields: [], rows: [] });
  });

  it('maps ssl: true to a pg SSL config honoring trustServerCert', async () => {
    queueControlAndResult({ fields: [], rows: [] });

    await runPostgres(connectionArgs({ ssl: true, trustServerCert: true }), 'SELECT 1');

    expect(clientConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });

  it('maps ssl: false to a literal false pg SSL config', async () => {
    queueControlAndResult({ fields: [], rows: [] });

    await runPostgres(connectionArgs({ ssl: false }), 'SELECT 1');

    expect(clientConfigMock).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
  });

  it('still rolls back and closes the client when the caller query rejects', async () => {
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET TRANSACTION READ ONLY
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockRejectedValueOnce(new Error('syntax error')) // the caller's query
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(runPostgres(connectionArgs(), 'SELECT bogus')).rejects.toThrow('syntax error');

    expect(queryMock).toHaveBeenNthCalledWith(5, 'ROLLBACK');
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('swallows a rollback failure rather than masking the original error', async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('original failure'))
      .mockRejectedValueOnce(new Error('rollback also failed'));

    await expect(runPostgres(connectionArgs(), 'SELECT bogus')).rejects.toThrow('original failure');
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
