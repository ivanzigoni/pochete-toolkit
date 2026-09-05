/**
 * Resolves the registered connection profiles from this tool's config.json (see config.ts) — the
 * single source of truth for which DB (engine/host/port/database/user) a given `connection`
 * argument targets. Only the password is kept out of this file, behind the env var each profile
 * names.
 *
 * As a consequence of config.json being read fresh per call (never at module load time — see
 * config.ts), the tool's input schema can no longer enumerate registered connections as a strict
 * Zod enum (that would still require reading the file at import time) — `connection` is a free
 * string, validated against the registry inside the handler instead (see register.ts).
 */
import type { EnvConfig } from '../../shared/env-config.js';
import { loadConfig } from './config.js';
import type { ConnectionProfile, Engine, ResolvedConnectionProfile } from './types.js';

export type { ConnectionProfile, ResolvedConnectionProfile };

const DEFAULT_PORT: Record<Engine, number> = { postgres: 5432, mssql: 1433 };

function isEngine(value: string): value is Engine {
  return value === 'postgres' || value === 'mssql';
}

function loadConnectionProfiles(): Readonly<Record<string, ConnectionProfile>> {
  return loadConfig().connections;
}

export function listConnectionProfileKeys(): string[] {
  return Object.keys(loadConnectionProfiles());
}

// Pure lookup taking the registry as a parameter — kept separate from resolveConnectionProfile
// below so unit tests can exercise it against a literal fixture registry instead of the real,
// gitignored config.json (whose host/user identify a real database and must never appear as a
// literal in test source).
export function resolveConnectionProfileIn(
  registry: Readonly<Record<string, ConnectionProfile>>,
  key: string,
): ResolvedConnectionProfile {
  const profile = registry[key];
  if (!profile) {
    throw new Error(
      `unknown connection "${key}" — registered connections: ${Object.keys(registry).join(', ')} (see config.json)`,
    );
  }
  if (!isEngine(profile.engine)) {
    throw new Error(
      `connection "${key}" has an invalid engine in config.json: "${profile.engine}" (must be 'postgres' or 'mssql')`,
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
  return resolveConnectionProfileIn(loadConnectionProfiles(), key);
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveConnectionPassword(key: string, env: EnvConfig): string {
  const profiles = loadConnectionProfiles();
  const profile = profiles[key];
  if (!profile) {
    throw new Error(
      `unknown connection "${key}" — registered connections: ${Object.keys(profiles).join(', ')} (see config.json)`,
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
