/**
 * Loads the registered auth profiles from `auth-profiles.json` — the single source of truth for
 * which Railway project token, project id, environment id, and (optionally) service id a given
 * `authProfile` argument resolves to. One profile per Railway project+environment, never a single
 * account-wide token, by design: a compromised profile only ever reaches the one project it names.
 *
 * Read fresh on every call, never at module load time — same contract as every other tool's own
 * registry (safe-curl/auth-profiles.ts, safe-query/connection-profiles.ts). See
 * shared/json-registry.ts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';
import { loadJsonRegistry } from '../../shared/json-registry.js';
import type { RailwayAuthProfile } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests (unit and e2e alike) can point this at a temp fixture instead of the real,
// gitignored auth-profiles.json — mirrors EnvConfig's own POCHETE_MCP_ENV_FILE override.
function registryPath(): string {
  return (
    process.env.POCHETE_RAILWAY_SAFE_CLI_AUTH_PROFILES_FILE ??
    path.join(moduleDir, 'auth-profiles.json')
  );
}

function loadAuthProfiles(): Readonly<Record<string, RailwayAuthProfile>> {
  return loadJsonRegistry<Record<string, RailwayAuthProfile>>(registryPath(), {});
}

export function listAuthProfileKeys(): string[] {
  return Object.keys(loadAuthProfiles());
}

export function resolveAuthProfile(key: string): RailwayAuthProfile {
  const profiles = loadAuthProfiles();
  const profile = profiles[key];
  if (!profile) {
    throw new Error(
      `unknown authProfile "${key}" — registered profiles: ${Object.keys(profiles).join(', ')} (see auth-profiles.json)`,
    );
  }
  return profile;
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveAuthToken(key: string, env: EnvConfig): string {
  const profile = resolveAuthProfile(key);
  const value = env.getRaw(profile.envVar);
  if (!value) {
    throw new Error(
      `env var ${profile.envVar} (authProfile "${key}") is not set in this tool's .env — see ` +
        'src/tools/railway-safe-cli/.env.example',
    );
  }
  return value;
}
