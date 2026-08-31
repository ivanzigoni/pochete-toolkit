import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  listAuthProfileKeys,
  resolveAuthProfile,
  resolveCredentials,
} from '../../../../src/tools/bitbucket-open-pr/auth-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

// resolveCredentials reads via an EnvConfig instance, never process.env directly — so a test
// that wants given credential env vars points POCHETE_MCP_ENV_FILE at its own temp file instead.
async function envConfigWith(vars: Record<string, string>): Promise<EnvConfig> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return new EnvConfig('bitbucket-open-pr');
}

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrentEnvFile?.();
  cleanupCurrentEnvFile = undefined;
});

// Fixture-only registry — never the real, gitignored auth-profiles.json (see
// auth-profiles.example.json for its shape), so no real profile name ever appears as a literal in
// this test file.
const REGISTRY_FILE_VAR = 'POCHETE_BITBUCKET_OPEN_PR_AUTH_PROFILES_FILE';
const originalRegistryFileVar = process.env[REGISTRY_FILE_VAR];
let cleanupRegistryFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: registryFilePath, cleanup } = await writeTempJsonFile('auth-profiles.json', {
    'example-profile': {
      emailEnvVar: 'OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL',
      apiTokenEnvVar: 'OPEN_PULL_REQUEST_EXAMPLE_PROFILE_API_TOKEN',
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
  it('includes the "example-profile" profile registered in auth-profiles.json', () => {
    expect(listAuthProfileKeys()).toContain('example-profile');
  });
});

describe('resolveAuthProfile', () => {
  it('resolves the "example-profile" profile to its email/token env var names', () => {
    expect(resolveAuthProfile('example-profile')).toEqual({
      emailEnvVar: 'OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL',
      apiTokenEnvVar: 'OPEN_PULL_REQUEST_EXAMPLE_PROFILE_API_TOKEN',
    });
  });

  it('throws, naming the unknown key, for an unregistered profile', () => {
    expect(() => resolveAuthProfile('not-a-real-profile')).toThrow(/not-a-real-profile/);
  });
});

describe('resolveCredentials', () => {
  it('returns email and apiToken from the profile-registered env vars when both are set', async () => {
    const env = await envConfigWith({
      OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL: 'dev@example.com',
      OPEN_PULL_REQUEST_EXAMPLE_PROFILE_API_TOKEN: 'test-token-value',
    });
    expect(resolveCredentials('example-profile', env)).toEqual({
      email: 'dev@example.com',
      apiToken: 'test-token-value',
    });
  });

  it('throws, naming the env var and profile, when the email env var is unset', async () => {
    const env = await envConfigWith({
      OPEN_PULL_REQUEST_EXAMPLE_PROFILE_API_TOKEN: 'test-token-value',
    });
    expect(() => resolveCredentials('example-profile', env)).toThrow(/OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL/);
    expect(() => resolveCredentials('example-profile', env)).toThrow(/authProfile "example-profile"/);
  });

  it('throws, naming the env var and profile, when the token env var is unset', async () => {
    const env = await envConfigWith({ OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL: 'dev@example.com' });
    expect(() => resolveCredentials('example-profile', env)).toThrow(/OPEN_PULL_REQUEST_EXAMPLE_PROFILE_API_TOKEN/);
    expect(() => resolveCredentials('example-profile', env)).toThrow(/authProfile "example-profile"/);
  });

  it('throws when the email env var is empty', async () => {
    const env = await envConfigWith({
      OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL: '',
      OPEN_PULL_REQUEST_EXAMPLE_PROFILE_API_TOKEN: 'test-token-value',
    });
    expect(() => resolveCredentials('example-profile', env)).toThrow(/OPEN_PULL_REQUEST_EXAMPLE_PROFILE_EMAIL/);
  });
});
