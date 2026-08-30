/**
 * Loads the registered connection profiles from `connection-profiles.json` — the single source
 * of truth for which DB (engine/host/port/database/user) a given `connection` argument targets.
 * Only the password is kept out of this file, behind the env var each profile names.
 *
 * Read at module load time, like safe-curl's AUTH_PROFILES and portainer-get-container-logs' ENVIRONMENTS:
 * every e2e test spawns its own fresh process, so there is no ordering hazard in reading this
 * once up front and using it to build the tool's input schema (register.ts). Adding a new
 * profile still requires an MCP server restart either way — the enum in the tool's input schema
 * is itself fixed at server startup, so a fresh per-call read would not lift that limitation.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';
import type { Engine } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(moduleDir, 'connection-profiles.json');

const DEFAULT_PORT: Record<Engine, number> = { postgres: 5432, mssql: 1433 };

export interface ConnectionProfile {
  readonly engine: Engine;
  readonly host: string;
  readonly port?: number;
  readonly database: string;
  readonly user: string;
  // Name of the env var (in this server's own .env) holding this profile's password — never the
  // password itself. The file as a whole is still gitignored (see connection-profiles.example.json
  // for its shape): host/database/user identify the real environment even without a password.
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

function isEngine(value: string): value is Engine {
  return value === 'postgres' || value === 'mssql';
}

const RAW_PROFILES: Readonly<Record<string, ConnectionProfile>> = JSON.parse(
  readFileSync(REGISTRY_PATH, 'utf-8'),
) as Record<string, ConnectionProfile>;

export const CONNECTION_PROFILE_KEYS = Object.keys(RAW_PROFILES);

// Pure lookup taking the registry as a parameter — kept separate from resolveConnectionProfile
// below so unit tests can exercise it against a literal fixture registry instead of the real,
// gitignored connection-profiles.json (whose host/user identify a real database and must never
// appear as a literal in test source).
export function resolveConnectionProfileIn(
  registry: Readonly<Record<string, ConnectionProfile>>,
  key: string,
): ResolvedConnectionProfile {
  const profile = registry[key];
  if (!profile) {
    throw new Error(
      `unknown connection "${key}" — registered connections: ${Object.keys(registry).join(', ')} (see connection-profiles.json)`,
    );
  }
  if (!isEngine(profile.engine)) {
    throw new Error(
      `connection "${key}" has an invalid engine in connection-profiles.json: "${profile.engine}" (must be 'postgres' or 'mssql')`,
    );
  }
  return {
    engine: profile.engine,
    host: profile.host,
    port: profile.port ?? DEFAULT_PORT[profile.engine],
    database: profile.database,
    user: profile.user,
    ssl: profile.ssl ?? false,
    trustServerCert: profile.trustServerCert ?? false,
  };
}

export function resolveConnectionProfile(key: string): ResolvedConnectionProfile {
  return resolveConnectionProfileIn(RAW_PROFILES, key);
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveConnectionPassword(key: string, env: EnvConfig): string {
  const profile = RAW_PROFILES[key];
  if (!profile) {
    throw new Error(
      `unknown connection "${key}" — registered connections: ${CONNECTION_PROFILE_KEYS.join(', ')} (see connection-profiles.json)`,
    );
  }
  const value = env.getRaw(profile.passwordEnvVar);
  if (!value) {
    throw new Error(
      `env var ${profile.passwordEnvVar} (connection "${key}") is not set in this tool's .env — ` +
        'see src/tools/safe-query/.env.example',
    );
  }
  return value;
}
