/**
 * Loads the registered auth profiles from `auth-profiles.json` — the single source of truth for
 * which credential a given authProfile injects. This registry does not restrict which host a
 * profile may be used against — nothing here or in register.ts validates the curl's target host
 * against the profile, so any authProfile's credential can be sent to any URL the tool is asked
 * to call.
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

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests (unit and e2e alike) can point this at a temp fixture instead of the real,
// gitignored auth-profiles.json — mirrors EnvConfig's own POCHETE_MCP_ENV_FILE override for .env.
// Resolved fresh inside loadAuthProfiles(), never cached at module load time, so a test that sets
// this var after the module has already been imported (the in-process unit-test case) still takes
// effect on its next call.
function registryPath(): string {
  return process.env.POCHETE_SAFE_CURL_AUTH_PROFILES_FILE ?? path.join(moduleDir, 'auth-profiles.json');
}

const DEFAULT_HEADER_NAME = 'Cookie';

// A profile injecting one opaque value (a cookie, a bearer token, an API key) under a single
// header — the tool's original shape. `type` is omitted for every profile predating the "basic"
// variant below, which is why none of them need a JSON change to keep working.
export interface HeaderAuthProfile {
  readonly type?: 'header';
  readonly envVar: string;
  // Header the credential is injected under. Defaults to "Cookie" when absent, which is why
  // every profile predating this field needs no JSON change to keep working.
  readonly headerName?: string;
}

// A profile injecting HTTP Basic auth built from a separate user/password pair — same
// credential-pair shape as bitbucket-open-pr's and jira-*'s own emailEnvVar/apiTokenEnvVar
// profiles, generalized to a plain user/password pair since Basic auth isn't Atlassian-specific.
// Always injected under "Authorization"; `headerName` doesn't apply to this variant.
export interface BasicAuthProfile {
  readonly type: 'basic';
  readonly userEnvVar: string;
  readonly passwordEnvVar: string;
}

export type AuthProfile = HeaderAuthProfile | BasicAuthProfile;

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
        'src/tools/safe-curl/.env.example',
    );
  }
  return value;
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveAuthCredential(key: string, env: EnvConfig): string {
  const profile = resolveAuthProfile(key);
  if (profile.type === 'basic') {
    const user = resolveEnvVar(profile.userEnvVar, key, env);
    const password = resolveEnvVar(profile.passwordEnvVar, key, env);
    const encoded = Buffer.from(`${user}:${password}`).toString('base64');
    return `Basic ${encoded}`;
  }
  return resolveEnvVar(profile.envVar, key, env);
}

export function resolveAuthHeaderName(key: string): string {
  const profile = resolveAuthProfile(key);
  return profile.type === 'basic' ? 'Authorization' : (profile.headerName ?? DEFAULT_HEADER_NAME);
}
