import type { EnvConfig } from '../../shared/env-config.js';
import { loadConfig } from './config.js';
import type { ConfiguredPortainerEnvironment, RawPortainerEnvironment } from './types.js';

function loadEnvironments(): Readonly<Record<string, RawPortainerEnvironment>> {
  return loadConfig().environments;
}

export function listEnvironmentKeys(): string[] {
  return Object.keys(loadEnvironments());
}

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

export function resolveCredential(key: string, env: EnvConfig): string {
  const configured = requireConfiguredEnvironment(key);
  const value = env.getRaw(configured.envVar);
  if (!value) {
    throw new Error(
      `env var ${configured.envVar} (environment "${key}") is not set in this tool's .env — see ` +
        'src/tools/portainer-get-container-stats/.env.example',
    );
  }
  return value;
}
