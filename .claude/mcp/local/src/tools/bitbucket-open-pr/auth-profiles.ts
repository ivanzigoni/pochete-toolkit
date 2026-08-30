/**
 * Loads the registered auth profiles from `auth-profiles.json` — same "single source of truth,
 * one JSON registry per authProfile key" shape as safe-curl's auth-profiles.ts, but each profile
 * here names a pair of env vars (Atlassian account email + Bitbucket API token, Basic-auth
 * credentials) instead of a single cookie env var.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';
import type { BitbucketCredentials } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(moduleDir, 'auth-profiles.json');

export interface AuthProfile {
  readonly emailEnvVar: string;
  readonly apiTokenEnvVar: string;
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

function resolveEnvVar(envVar: string, key: string, env: EnvConfig): string {
  const value = env.getRaw(envVar);
  if (!value) {
    throw new Error(
      `env var ${envVar} (authProfile "${key}") is not set in this tool's .env — see ` +
        'src/tools/bitbucket-open-pr/.env.example',
    );
  }
  return value;
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveCredentials(key: string, env: EnvConfig): BitbucketCredentials {
  const profile = resolveAuthProfile(key);
  return {
    email: resolveEnvVar(profile.emailEnvVar, key, env),
    apiToken: resolveEnvVar(profile.apiTokenEnvVar, key, env),
  };
}
