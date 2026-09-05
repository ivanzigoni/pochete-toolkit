import { Client } from 'pg';
import type { ConnectionArgs, QueryResult } from '../types.js';

export async function runPostgres(args: ConnectionArgs, query: string): Promise<QueryResult> {
  const timeoutMs = args.timeoutSeconds * 1000;
  const client = new Client({
    host: args.host,
    port: args.port,
    database: args.database,
    user: args.user,
    password: args.password,
    ssl: args.ssl ? { rejectUnauthorized: !args.trustServerCert } : false,
    query_timeout: timeoutMs,
    connectionTimeoutMillis: timeoutMs,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${Math.trunc(timeoutMs)}`);
    const result = await client.query(query);
    const fields = (result.fields ?? []).map((f) => f.name);
    return { fields, rows: result.rows as Record<string, unknown>[] };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
