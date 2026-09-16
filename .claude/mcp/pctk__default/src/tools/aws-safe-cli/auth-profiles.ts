/**
 * Loads the registered auth profiles from `auth-profiles.json` — the single source of truth for
 * which AWS access key/secret key (and optional session token) and region a given `authProfile`
 * argument resolves to. One profile per IAM credential + region, never a single account-wide
 * credential shared across every call, by design: a compromised profile only ever reaches what
 * its own IAM policy allows, in the one region it names.
 *
 * Read fresh on every call, never at module load time — same contract as every other tool's own
 * registry (safe-curl/auth-profiles.ts, safe-query/connection-profiles.ts,
 * railway-safe-cli/auth-profiles.ts). See shared/json-registry.ts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';
import { loadJsonRegistry } from '../../shared/json-registry.js';
import type { AwsAuthProfile } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests (unit and e2e alike) can point this at a temp fixture instead of the real,
// gitignored auth-profiles.json — mirrors EnvConfig's own POCHETE_MCP_ENV_FILE override.
function registryPath(): string {
  return (
    process.env.POCHETE_AWS_SAFE_CLI_AUTH_PROFILES_FILE ??
    path.join(moduleDir, 'auth-profiles.json')
  );
}

function loadAuthProfiles(): Readonly<Record<string, AwsAuthProfile>> {
  return loadJsonRegistry<Record<string, AwsAuthProfile>>(registryPath(), {});
}

export function listAuthProfileKeys(): string[] {
  return Object.keys(loadAuthProfiles());
}

export function resolveAuthProfile(key: string): AwsAuthProfile {
  const profiles = loadAuthProfiles();
  const profile = profiles[key];
  if (!profile) {
    throw new Error(
      `unknown authProfile "${key}" — registered profiles: ${Object.keys(profiles).join(', ')} (see auth-profiles.json)`,
    );
  }
  return profile;
}

export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string | undefined;
  readonly region: string;
}

function resolveEnvVar(envVarName: string, key: string, env: EnvConfig): string {
  const value = env.getRaw(envVarName);
  if (!value) {
    throw new Error(
      `env var ${envVarName} (authProfile "${key}") is not set in this tool's .env — see ` +
        'src/tools/aws-safe-cli/.env.example',
    );
  }
  return value;
}

// Takes an EnvConfig instance rather than constructing its own, so a call site that needs more
// than one value from .env can still read the file exactly once (see EnvConfig's own doc comment).
export function resolveAwsCredentials(key: string, env: EnvConfig): AwsCredentials {
  const profile = resolveAuthProfile(key);
  const accessKeyId = resolveEnvVar(profile.accessKeyIdEnvVar, key, env);
  const secretAccessKey = resolveEnvVar(profile.secretAccessKeyEnvVar, key, env);
  const sessionToken = profile.sessionTokenEnvVar
    ? resolveEnvVar(profile.sessionTokenEnvVar, key, env)
    : undefined;
  return { accessKeyId, secretAccessKey, sessionToken, region: profile.region };
}
