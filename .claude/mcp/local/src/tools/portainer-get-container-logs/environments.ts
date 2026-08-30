/**
 * Loads the registered Portainer environments from `environments.json` — self-contained to this
 * tool, deliberately not sharing safe-curl's `auth-profiles.json`/`auth-profiles.ts` even though
 * the "hml" entry reuses the same PORTAINER_HML_API_KEY env var value: this codebase's established
 * pattern (see safe-curl vs. bitbucket-open-pr) is one profile registry per tool, never a shared
 * import between tool directories, even when two tools happen to target the same external host.
 *
 * Read at module load time, like safe-curl's AUTH_PROFILES — every e2e test spawns its own fresh
 * process, so there is no ordering hazard in reading this once up front.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvConfig } from '../../shared/env-config.js';
import type { ConfiguredPortainerEnvironment, RawPortainerEnvironment } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// Overridable so e2e tests can point this at a temp fixture instead of the real, gitignored
// environments.json — mirrors EnvConfig's own CEM_MCP_ENV_FILE override for .env.
const REGISTRY_PATH = process.env.CEM_PORTAINER_ENVIRONMENTS_FILE ?? path.join(moduleDir, 'environments.json');

const ENVIRONMENTS: Readonly<Record<string, RawPortainerEnvironment>> = JSON.parse(
  readFileSync(REGISTRY_PATH, 'utf-8'),
) as Record<string, RawPortainerEnvironment>;

export const ENVIRONMENT_KEYS = Object.keys(ENVIRONMENTS);

// Pure lookup taking the registry as a parameter — kept separate from resolveEnvironment below so
// unit tests can exercise it against a literal fixture registry instead of the real, gitignored
// environments.json (whose host/stackNamespace identify a real deployment and must never appear
// as a literal in test source).
export function resolveEnvironmentIn(
  registry: Readonly<Record<string, RawPortainerEnvironment>>,
  key: string,
): RawPortainerEnvironment {
  const env = registry[key];
  if (!env) {
    throw new Error(
      `unknown environment "${key}" — registered environments: ${Object.keys(registry).join(', ')} (see environments.json)`,
    );
  }
  return env;
}

export function resolveEnvironment(key: string): RawPortainerEnvironment {
  return resolveEnvironmentIn(ENVIRONMENTS, key);
}

const NULLABLE_FIELDS = ['host', 'endpointId', 'stackNamespace'] as const;

/**
 * Asserts every nullable field of an already-resolved environment is actually set — a pure check
 * on a plain object, kept separate from requireConfiguredEnvironment below so it stays testable
 * in isolation even when every real environment in environments.json happens to be fully
 * configured (as both "hml" and "prd" are today) — the gate a new environment entry would need to
 * clear before its real host/endpointId/stackNamespace are known, failing loudly and by name
 * instead of producing a broken URL.
 */
export function assertFullyConfigured(
  key: string,
  env: RawPortainerEnvironment,
): ConfiguredPortainerEnvironment {
  const missing = NULLABLE_FIELDS.filter((field) => env[field] === null);
  if (missing.length > 0) {
    throw new Error(
      `environment "${key}" is not fully configured yet in environments.json (missing: ${missing.join(', ')})`,
    );
  }
  return env as ConfiguredPortainerEnvironment;
}

export function requireConfiguredEnvironmentIn(
  registry: Readonly<Record<string, RawPortainerEnvironment>>,
  key: string,
): ConfiguredPortainerEnvironment {
  return assertFullyConfigured(key, resolveEnvironmentIn(registry, key));
}

export function requireConfiguredEnvironment(key: string): ConfiguredPortainerEnvironment {
  return assertFullyConfigured(key, resolveEnvironment(key));
}

// Mirrors safe-curl's resolveAuthCredential — takes an EnvConfig instance rather than
// constructing its own, so a call site needing more than one value still reads .env once.
export function resolveCredential(key: string, env: EnvConfig): string {
  const configured = requireConfiguredEnvironment(key);
  const value = env.getRaw(configured.envVar);
  if (!value) {
    throw new Error(
      `env var ${configured.envVar} (environment "${key}") is not set in this tool's .env — see ` +
        'src/tools/portainer-get-container-logs/.env.example',
    );
  }
  return value;
}
