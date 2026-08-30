import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionArgs } from '../../../../../src/tools/safe-query/types.js';

const { connectMock, beginMock, rollbackMock, closeMock, requestQueryMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  beginMock: vi.fn(),
  rollbackMock: vi.fn(),
  closeMock: vi.fn(),
  requestQueryMock: vi.fn(),
}));

vi.mock('mssql', () => {
  class Transaction {
    pool: unknown;

    constructor(pool: unknown) {
      this.pool = pool;
    }

    begin = beginMock;

    rollback = rollbackMock;
  }

  class Request {
    transactionOrPool: unknown;

    constructor(transactionOrPool: unknown) {
      this.transactionOrPool = transactionOrPool;
    }

    query = requestQueryMock;
  }

  return { default: { connect: connectMock, Transaction, Request } };
});

const { runMssql } = await import('../../../../../src/tools/safe-query/db/mssql.js');

function connectionArgs(overrides: Partial<ConnectionArgs> = {}): ConnectionArgs {
  return {
    engine: 'mssql',
    host: 'fake-host',
    port: 1433,
    database: 'fakedb',
    user: 'fakeuser',
    password: 'fakepass',
    timeoutSeconds: 30,
    ssl: false,
    trustServerCert: false,
    ...overrides,
  };
}

beforeEach(() => {
  connectMock.mockReset().mockResolvedValue({ close: closeMock });
  beginMock.mockReset().mockResolvedValue(undefined);
  rollbackMock.mockReset().mockResolvedValue(undefined);
  closeMock.mockReset().mockResolvedValue(undefined);
  requestQueryMock.mockReset();
});

describe('runMssql', () => {
  it('opens a transaction, runs the query, then rolls back and closes the pool', async () => {
    requestQueryMock.mockResolvedValueOnce({ recordset: [{ a: 1 }] });

    const result = await runMssql(connectionArgs(), 'SELECT 1 AS a');

    expect(result).toEqual({ fields: ['a'], rows: [{ a: 1 }] });
    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(requestQueryMock).toHaveBeenCalledWith('SELECT 1 AS a');
    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('defaults fields to [] when the recordset is empty', async () => {
    requestQueryMock.mockResolvedValueOnce({ recordset: [] });

    const result = await runMssql(connectionArgs(), 'SELECT');

    expect(result).toEqual({ fields: [], rows: [] });
  });

  it('defaults rows to [] when the driver returns no recordset at all', async () => {
    requestQueryMock.mockResolvedValueOnce({});

    const result = await runMssql(connectionArgs(), 'SELECT');

    expect(result).toEqual({ fields: [], rows: [] });
  });

  it('maps ssl/trustServerCert onto the connect options passed to sql.connect', async () => {
    requestQueryMock.mockResolvedValueOnce({ recordset: [] });

    await runMssql(connectionArgs({ ssl: true, trustServerCert: true }), 'SELECT 1');

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { encrypt: true, trustServerCertificate: true },
      }),
    );
  });

  it('derives connectionTimeout/requestTimeout in ms from timeoutSeconds', async () => {
    requestQueryMock.mockResolvedValueOnce({ recordset: [] });

    await runMssql(connectionArgs({ timeoutSeconds: 5 }), 'SELECT 1');

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 5000, requestTimeout: 5000 }),
    );
  });

  it('still rolls back the transaction and closes the pool when the query rejects', async () => {
    requestQueryMock.mockRejectedValueOnce(new Error('syntax error'));

    await expect(runMssql(connectionArgs(), 'SELECT bogus')).rejects.toThrow('syntax error');

    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('swallows a rollback failure rather than masking the original error', async () => {
    requestQueryMock.mockRejectedValueOnce(new Error('original failure'));
    rollbackMock.mockRejectedValueOnce(new Error('rollback also failed'));

    await expect(runMssql(connectionArgs(), 'SELECT bogus')).rejects.toThrow('original failure');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
