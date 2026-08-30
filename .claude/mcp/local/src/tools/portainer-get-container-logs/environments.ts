/**
 * Resolves the registered Portainer environments from this tool's config.json (see config.ts) —
 * self-contained to this tool, deliberately not sharing safe-curl's
 * `auth-profiles.json`/`auth-profiles.ts` even though the "hml" entry reuses the same
 * PORTAINER_HML_API_KEY env var value: this codebase's established pattern (see safe-curl vs.
 * bitbucket-open-pr) is one config file per tool, never a shared import between tool directories,
 * even when two tools happen to target the same external host.
 */
import type { EnvConfig } from '../../shared/env-config.js';
import { loadConfig } from './config.js';
import type { ConfiguredPortainerEnvironment, RawPortainerEnvironment } from './types.js';

function loadEnvironments(): Readonly<Record<string, RawPortainerEnvironment>> {
  return loadConfig().environments;
}

export function listEnvironmentKeys(): string[] {
  return Object.keys(loadEnvironments());
}

// Pure lookup taking the registry as a parameter — kept separate from resolveEnvironment below so
// unit tests can exercise it against a literal fixture registry instead of the real, gitignored
// config.json (whose host/stackNamespace identify a real deployment and must never appear as a
// literal in test source).
export function resolveEnvironmentIn(
  registry: Readonly<Record<string, RawPortainerEnvironment>>,
  key: string,
): RawPortainerEnvironment {
  const env = registry[key];
  if (!env) {
    throw new Error(
      `unknown environment "${key}" — registered environments: ${Object.keys(registry).join(', ')} (see config.json)`,
    );
  }
  return env;
}

export function resolveEnvironment(key: string): RawPortainerEnvironment {
  return resolveEnvironmentIn(loadEnvironments(), key);
}

const NULLABLE_FIELDS = ['host', 'endpointId', 'stackNamespace'] as const;

/**
 * Asserts every nullable field of an already-resolved environment is actually set — a pure check
 * on a plain object, kept separate from requireConfiguredEnvironment below so it stays testable
 * in isolation even when every real environment in config.json happens to be fully
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
      `environment "${key}" is not fully configured yet in config.json (missing: ${missing.join(', ')})`,
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
