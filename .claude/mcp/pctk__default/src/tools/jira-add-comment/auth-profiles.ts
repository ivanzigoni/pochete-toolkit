/**
 * Loads the registered auth profiles from `auth-profiles.json` — same "single source of truth,
 * one JSON registry per authProfile key" shape as bitbucket-open-pr's auth-profiles.ts. Each
 * profile here names the Jira Cloud site (non-secret, so it lives directly in this JSON file
 * rather than behind an env var) plus a pair of env vars for the Basic-auth credential (Atlassian
 * account email + API token).
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
import type { JiraCredentials } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests (unit and e2e alike) can point this at a temp fixture instead of the real,
// gitignored auth-profiles.json — mirrors EnvConfig's own POCHETE_MCP_ENV_FILE override for .env.
// Resolved fresh inside loadAuthProfiles(), never cached at module load time, so a test that sets
// this var after the module has already been imported (the in-process unit-test case) still takes
// effect on its next call.
function registryPath(): string {
  return (
    process.env.POCHETE_JIRA_ADD_COMMENT_AUTH_PROFILES_FILE ??
    path.join(moduleDir, 'auth-profiles.json')
  );
}

export interface AuthProfile {
  readonly siteUrl: string;
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

// Avoids a trailing-slash regex (`/\/+$/`) flagged by sonarjs as super-linear — a plain
// character scan is just as clear here and carries no backtracking risk to reason about.
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

function resolveEnvVar(envVar: string, key: string, env: EnvConfig): string {
  const value = env.getRaw(envVar);
  if (!value) {
    throw new Error(
      `env var ${envVar} (authProfile "${key}") is not set in this tool's .env — see ` +
        'src/tools/jira-add-comment/.env.example',
    );
  }
  return value;
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveCredentials(key: string, env: EnvConfig): JiraCredentials {
  const profile = resolveAuthProfile(key);
  return {
    siteUrl: stripTrailingSlashes(profile.siteUrl),
    email: resolveEnvVar(profile.emailEnvVar, key, env),
    apiToken: resolveEnvVar(profile.apiTokenEnvVar, key, env),
  };
}
