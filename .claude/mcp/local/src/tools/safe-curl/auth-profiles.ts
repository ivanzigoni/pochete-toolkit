/**
 * Loads the registered auth profiles from `auth-profiles.json` — the single source of truth for
 * which credential a given authProfile injects. This registry does not restrict which host a
 * profile may be used against — nothing here or in register.ts validates the curl's target host
 * against the profile, so any authProfile's credential can be sent to any URL the tool is asked
 * to call.
 *
 * Read at module load time, not lazily: unlike the credential value itself (see
 * `resolveAuthCredential` below), the registry's shape doesn't depend on `dotenv.config()` having
 * run yet, so there is no ordering hazard in loading it up front and using it to build the tool's
 * input schema (register.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(moduleDir, 'auth-profiles.json');

const DEFAULT_HEADER_NAME = 'Cookie';

export interface AuthProfile {
  readonly envVar: string;
  // Header the credential is injected under. Defaults to "Cookie" when absent, which is why
  // every profile predating this field (e.g. "cem") needs no JSON change to keep working.
  readonly headerName?: string;
}

const AUTH_PROFILES: Readonly<Record<string, AuthProfile>> = JSON.parse(
  readFileSync(REGISTRY_PATH, 'utf-8'),
) as Record<string, AuthProfile>;

export const AUTH_PROFILE_KEYS = Object.keys(AUTH_PROFILES);

export function resolveAuthProfile(key: string): AuthProfile {
  const profile = AUTH_PROFILES[key];
  if (!profile) {
    throw new Error(
      `unknown authProfile "${key}" — registered profiles: ${AUTH_PROFILE_KEYS.join(', ')} (see auth-profiles.json)`,
    );
  }
  return profile;
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveAuthCredential(key: string, env: EnvConfig): string {
  const profile = resolveAuthProfile(key);
  const value = env.getRaw(profile.envVar);
  if (!value) {
    throw new Error(
      `env var ${profile.envVar} (authProfile "${key}") is not set in this tool's .env — see ` +
        'src/tools/safe-curl/.env.example',
    );
  }
  return value;
}

export function resolveAuthHeaderName(key: string): string {
  return resolveAuthProfile(key).headerName ?? DEFAULT_HEADER_NAME;
}
