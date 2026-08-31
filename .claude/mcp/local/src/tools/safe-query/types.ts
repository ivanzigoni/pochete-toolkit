export type Engine = 'postgres' | 'mssql';

export interface ConnectionProfile {
  readonly engine: Engine;
  readonly host: string;
  readonly port?: number;
  readonly database: string;
  readonly user: string;
  // Name of the env var (in this server's own .env) holding this profile's password — never the
  // password itself. The file as a whole is still gitignored (see config.example.json for its
  // shape): host/database/user identify the real environment even without a password.
  readonly passwordEnvVar: string;
  readonly ssl?: boolean;
  readonly trustServerCert?: boolean;
}

export interface ResolvedConnectionProfile {
  readonly engine: Engine;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly ssl: boolean;
  readonly trustServerCert: boolean;
}

export interface MaskColumnsRegistry {
  readonly partial: readonly string[];
  readonly full: readonly string[];
}

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
