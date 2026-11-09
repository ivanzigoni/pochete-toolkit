/**
 * Loads the registered auth profiles from `auth-profiles.json` — same "single source of truth,
 * one JSON registry per authProfile key" shape as bitbucket-open-pr's auth-profiles.ts, and the
 * same Basic-auth credential pair (Atlassian account email + Bitbucket API token), since this
 * tool calls the same Bitbucket Cloud REST API.
 *
 * Read fresh on every call, never at module load time: a missing or malformed
 * auth-profiles.json must only ever fail this one tool's own call, inside its handler's own
 * try/catch — never the process import chain that every other tool in this server shares. See
 * shared/json-registry.ts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';
import { loadJsonRegistry } from '../../shared/json-registry.js';
import type { BitbucketCredentials } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests (unit and e2e alike) can point this at a temp fixture instead of the real,
// gitignored auth-profiles.json — mirrors bitbucket-open-pr's own override var.
function registryPath(): string {
  return (
    process.env.POCHETE_BITBUCKET_DEPLOY_LOGS_AUTH_PROFILES_FILE ??
    path.join(moduleDir, 'auth-profiles.json')
  );
}

export interface AuthProfile {
  readonly emailEnvVar: string;
  readonly apiTokenEnvVar: string;
}

function loadAuthProfiles(): Readonly<Record<string, AuthProfile>> {
  return loadJsonRegistry<Record<string, AuthProfile>>(registryPath(), {});
}

export function listAuthProfileKeys(): string[] {
  return Object.keys(loadAuthProfiles());
}

export function resolveAuthProfile(key: string): AuthProfile {
  const profiles = loadAuthProfiles();
  const profile = profiles[key];
  if (!profile) {
    throw new Error(
      `unknown authProfile "${key}" — registered profiles: ${Object.keys(profiles).join(', ')} (see auth-profiles.json)`,
    );
  }
  return profile;
}

function resolveEnvVar(envVar: string, key: string, env: EnvConfig): string {
  const value = env.getRaw(envVar);
  if (!value) {
    throw new Error(
      `env var ${envVar} (authProfile "${key}") is not set in this tool's .env — see ` +
        'src/tools/bitbucket-deploy-logs/.env.example',
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
