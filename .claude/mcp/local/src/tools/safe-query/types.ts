export type Engine = 'postgres' | 'mssql';

export interface ConnectionArgs {
  engine: Engine;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  timeoutSeconds: number;
  ssl: boolean;
  trustServerCert: boolean;
}

export interface QueryResult {
  fields: string[];
  rows: Record<string, unknown>[];
}

export interface OutputPayload {
  engine: Engine;
  host: string;
  database: string;
  executedAt: string;
  durationMs: number;
  columns: string[];
  rowCount: number;
  totalRowCount: number;
  truncated: boolean;
  rows: Record<string, unknown>[];
}
