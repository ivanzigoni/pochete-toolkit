import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  listAuthProfileKeys,
  resolveAuthProfile,
  resolveAuthToken,
} from '../../../../src/tools/railway-safe-cli/auth-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

async function envConfigWith(vars: Record<string, string>): Promise<EnvConfig> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return new EnvConfig('railway-safe-cli');
}

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrentEnvFile?.();
  cleanupCurrentEnvFile = undefined;
});

// Fixture-only registry — never the real, gitignored auth-profiles.json.
const REGISTRY_FILE_VAR = 'POCHETE_RAILWAY_SAFE_CLI_AUTH_PROFILES_FILE';
const originalRegistryFileVar = process.env[REGISTRY_FILE_VAR];
let cleanupRegistryFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: registryFilePath, cleanup } = await writeTempJsonFile('auth-profiles.json', {
    'example-project': {
      envVar: 'RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN',
      projectId: 'project-1',
      environmentId: 'environment-1',
    },
    'example-project-with-service': {
      envVar: 'RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN',
      projectId: 'project-2',
      environmentId: 'environment-2',
      serviceId: 'service-2',
    },
  });
  cleanupRegistryFile = cleanup;
  process.env[REGISTRY_FILE_VAR] = registryFilePath;
});

afterAll(async () => {
  if (originalRegistryFileVar === undefined) delete process.env[REGISTRY_FILE_VAR];
  else process.env[REGISTRY_FILE_VAR] = originalRegistryFileVar;
  await cleanupRegistryFile?.();
});

describe('listAuthProfileKeys', () => {
  it('includes both registered profiles', () => {
    expect(listAuthProfileKeys()).toEqual(
      expect.arrayContaining(['example-project', 'example-project-with-service']),
    );
  });
});

describe('resolveAuthProfile', () => {
  it('resolves a profile with no serviceId', () => {
    expect(resolveAuthProfile('example-project')).toEqual({
      envVar: 'RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN',
      projectId: 'project-1',
      environmentId: 'environment-1',
    });
  });

  it('resolves a profile with a serviceId', () => {
    expect(resolveAuthProfile('example-project-with-service')).toMatchObject({
      serviceId: 'service-2',
    });
  });

  it('throws, naming the unknown key, for an unregistered profile', () => {
    expect(() => resolveAuthProfile('not-a-real-profile')).toThrow(/not-a-real-profile/);
  });
});

describe('resolveAuthToken', () => {
  it('returns the value of the profile-registered env var when set', async () => {
    const env = await envConfigWith({ RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' });
    expect(resolveAuthToken('example-project', env)).toBe('test-token-value');
  });

  it('throws, naming the env var and profile, when the env var is unset', async () => {
    const env = await envConfigWith({});
    expect(() => resolveAuthToken('example-project', env)).toThrow(
      /RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN/,
    );
    expect(() => resolveAuthToken('example-project', env)).toThrow(/authProfile "example-project"/);
  });

  it('throws, naming the env var and profile, when the env var is empty', async () => {
    const env = await envConfigWith({ RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: '' });
    expect(() => resolveAuthToken('example-project', env)).toThrow(
      /RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN/,
    );
  });
});
