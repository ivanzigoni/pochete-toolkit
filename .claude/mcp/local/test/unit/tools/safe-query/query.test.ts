import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionArgs, QueryResult } from '../../../../src/tools/safe-query/types.js';

const { runPostgresMock, runMssqlMock } = vi.hoisted(() => ({
  runPostgresMock: vi.fn(),
  runMssqlMock: vi.fn(),
}));

vi.mock('../../../../src/tools/safe-query/db/postgres.js', () => ({
  runPostgres: runPostgresMock,
}));
vi.mock('../../../../src/tools/safe-query/db/mssql.js', () => ({ runMssql: runMssqlMock }));

const { runQuery } = await import('../../../../src/tools/safe-query/query.js');

function connectionArgs(engine: ConnectionArgs['engine']): ConnectionArgs {
  return {
    engine,
    host: 'fake-host',
    port: 5432,
    database: 'fakedb',
    user: 'fakeuser',
    password: 'fakepass',
    timeoutSeconds: 30,
    ssl: false,
    trustServerCert: false,
  };
}

beforeEach(() => {
  runPostgresMock.mockReset();
  runMssqlMock.mockReset();
});

describe('runQuery', () => {
  it('dispatches to runPostgres for a postgres engine, and not runMssql', async () => {
    const args = connectionArgs('postgres');
    const expected: QueryResult = { fields: ['a'], rows: [{ a: 1 }] };
    runPostgresMock.mockResolvedValueOnce(expected);

    const result = await runQuery(args, 'SELECT 1 AS a');

    expect(result).toBe(expected);
    expect(runPostgresMock).toHaveBeenCalledWith(args, 'SELECT 1 AS a');
    expect(runMssqlMock).not.toHaveBeenCalled();
  });

  it('dispatches to runMssql for a mssql engine, and not runPostgres', async () => {
    const args = connectionArgs('mssql');
    const expected: QueryResult = { fields: ['b'], rows: [{ b: 2 }] };
    runMssqlMock.mockResolvedValueOnce(expected);

    const result = await runQuery(args, 'SELECT 2 AS b');

    expect(result).toBe(expected);
    expect(runMssqlMock).toHaveBeenCalledWith(args, 'SELECT 2 AS b');
    expect(runPostgresMock).not.toHaveBeenCalled();
  });

  it('propagates a rejection from the underlying driver', async () => {
    const args = connectionArgs('postgres');
    runPostgresMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(runQuery(args, 'SELECT 1')).rejects.toThrow('connection refused');
  });
});
