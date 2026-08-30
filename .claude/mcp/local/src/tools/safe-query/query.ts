import { runMssql } from './db/mssql.js';
import { runPostgres } from './db/postgres.js';
import type { ConnectionArgs, QueryResult } from './types.js';

export async function runQuery(args: ConnectionArgs, query: string): Promise<QueryResult> {
  if (args.engine === 'postgres') return runPostgres(args, query);
  return runMssql(args, query);
}
