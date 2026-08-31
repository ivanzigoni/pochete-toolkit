import sql from 'mssql';
import type { ConnectionArgs, QueryResult } from '../types.js';

export async function runMssql(args: ConnectionArgs, query: string): Promise<QueryResult> {
  const timeoutMs = args.timeoutSeconds * 1000;
  const pool = await sql.connect({
    server: args.host,
    port: args.port,
    database: args.database,
    user: args.user,
    password: args.password,
    connectionTimeout: timeoutMs,
    requestTimeout: timeoutMs,
    options: {
      encrypt: args.ssl,
      trustServerCertificate: args.trustServerCert,
    },
  });

  const transaction = new sql.Transaction(pool);
  try {
    // A failed begin() must still fall through to closing the pool below — the pool itself
    // connected successfully and would otherwise leak — so begin() lives inside this try, not
    // ahead of it.
    await transaction.begin();
    // Per-request timeout comes from the pool's `requestTimeout` above — the typed `Request`
    // API doesn't expose an instance-level `timeout` setter.
    const request = new sql.Request(transaction);
    const result = await request.query(query);
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    const fields = rows.length > 0 ? Object.keys(rows[0]!) : [];
    return { fields, rows };
  } finally {
    await transaction.rollback().catch(() => undefined);
    await pool.close().catch(() => undefined);
  }
}
