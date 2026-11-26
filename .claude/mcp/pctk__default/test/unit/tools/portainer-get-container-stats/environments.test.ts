import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  assertFullyConfigured,
  listEnvironmentKeys,
  requireConfiguredEnvironmentIn,
  resolveCredential,
  resolveEnvironmentIn,
} from '../../../../src/tools/portainer-get-container-stats/environments.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const FAKE_REGISTRY = {
  hml: {
    envVar: 'PORTAINER_HML_API_KEY',
    host: 'portainer-hml.example.internal',
    endpointId: 1,
    headerName: 'X-API-Key',
    stackNamespace: 'example-stack-hml',
    services: ['svc-a', 'svc-b'],
  },
  prd: {
    envVar: 'PORTAINER_PRD_API_KEY',
    host: 'portainer.example.internal',
    endpointId: 1,
    headerName: 'X-API-Key',
    stackNamespace: 'example-stack-prd',
    services: ['svc-a'],
  },
};

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

async function envConfigWith(vars: Record<string, string>): Promise<EnvConfig> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return new EnvConfig('portainer-get-container-stats');
}

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrentEnvFile?.();
  cleanupCurrentEnvFile = undefined;
});

const CONFIG_FILE_VAR = 'POCHETE_PORTAINER_STATS_CONFIG_FILE';
const originalConfigFileVar = process.env[CONFIG_FILE_VAR];
let cleanupConfigFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: configPath, cleanup } = await writeTempJsonFile('config.json', {
    environments: FAKE_REGISTRY,
  });
  cleanupConfigFile = cleanup;
  process.env[CONFIG_FILE_VAR] = configPath;
});

afterAll(async () => {
  if (originalConfigFileVar === undefined) delete process.env[CONFIG_FILE_VAR];
  else process.env[CONFIG_FILE_VAR] = originalConfigFileVar;
  await cleanupConfigFile?.();
});

describe('listEnvironmentKeys', () => {
  it('includes "hml" and "prd"', () => {
    expect(listEnvironmentKeys()).toEqual(expect.arrayContaining(['hml', 'prd']));
  });
});

describe('resolveEnvironmentIn', () => {
  it('resolves "hml" to its full, non-null configuration', () => {
    expect(resolveEnvironmentIn(FAKE_REGISTRY, 'hml')).toEqual(FAKE_REGISTRY.hml);
  });

  it('resolves "prd" to its full, non-null configuration', () => {
    expect(resolveEnvironmentIn(FAKE_REGISTRY, 'prd')).toEqual(FAKE_REGISTRY.prd);
  });

  it('throws, naming the unknown key, for an unregistered environment', () => {
    expect(() => resolveEnvironmentIn(FAKE_REGISTRY, 'not-a-real-environment')).toThrow(
      /not-a-real-environment/,
    );
  });
});

describe('requireConfiguredEnvironmentIn', () => {
  it('returns "hml" unchanged (already fully configured)', () => {
    expect(requireConfiguredEnvironmentIn(FAKE_REGISTRY, 'hml').stackNamespace).toBe(
      'example-stack-hml',
    );
  });

  it('returns "prd" unchanged (already fully configured)', () => {
    expect(requireConfiguredEnvironmentIn(FAKE_REGISTRY, 'prd').stackNamespace).toBe(
      'example-stack-prd',
    );
  });
});

describe('assertFullyConfigured', () => {
  const partial = {
    envVar: 'SOME_VAR',
    host: null,
    endpointId: null,
    headerName: 'X-API-Key',
    stackNamespace: null,
    services: [],
  };

  it('returns the environment unchanged when every nullable field is already set', () => {
    const full = { ...partial, host: 'example.com', endpointId: 1, stackNamespace: 'stack' };
    expect(assertFullyConfigured('staging', full)).toEqual(full);
  });

  it('throws, naming the environment and every missing field', () => {
    expect(() => assertFullyConfigured('staging', partial)).toThrow(/environment "staging"/);
    expect(() => assertFullyConfigured('staging', partial)).toThrow(/host/);
    expect(() => assertFullyConfigured('staging', partial)).toThrow(/endpointId/);
    expect(() => assertFullyConfigured('staging', partial)).toThrow(/stackNamespace/);
  });

  it('names only the fields that are actually missing, not every nullable field', () => {
    const partiallyConfigured = { ...partial, host: 'example.com' };
    expect(() => assertFullyConfigured('staging', partiallyConfigured)).not.toThrow(/host/);
    expect(() => assertFullyConfigured('staging', partiallyConfigured)).toThrow(/endpointId/);
  });
});

describe('resolveCredential', () => {
  it('returns the value of the environment-registered env var when set', async () => {
    const env = await envConfigWith({ PORTAINER_HML_API_KEY: 'test-token-value' });
    expect(resolveCredential('hml', env)).toBe('test-token-value');
  });

  it('throws, naming the env var and environment, when the env var is unset', async () => {
    const env = await envConfigWith({});
    expect(() => resolveCredential('hml', env)).toThrow(/PORTAINER_HML_API_KEY/);
    expect(() => resolveCredential('hml', env)).toThrow(/environment "hml"/);
  });

  it('resolves "prd" from its own, differently-named env var', async () => {
    const env = await envConfigWith({ PORTAINER_PRD_API_KEY: 'prd-token-value' });
    expect(resolveCredential('prd', env)).toBe('prd-token-value');
  });
});
