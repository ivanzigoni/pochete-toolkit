import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  listAuthProfileKeys,
  resolveAuthCredential,
  resolveAuthHeaderName,
  resolveAuthProfile,
} from '../../../../src/tools/safe-curl/auth-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

// resolveAuthCredential reads via an EnvConfig instance, never process.env directly — so a test that
// wants a given SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE points POCHETE_MCP_ENV_FILE at its own temp file instead.
async function envConfigWith(vars: Record<string, string>): Promise<EnvConfig> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return new EnvConfig('safe-curl');
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
const REGISTRY_FILE_VAR = 'POCHETE_SAFE_CURL_AUTH_PROFILES_FILE';
const originalRegistryFileVar = process.env[REGISTRY_FILE_VAR];
let cleanupRegistryFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: registryFilePath, cleanup } = await writeTempJsonFile('auth-profiles.json', {
    'example-profile': { envVar: 'SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE' },
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
  it('resolves the "example-profile" profile to its envVar', () => {
    expect(resolveAuthProfile('example-profile')).toEqual({
      envVar: 'SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE',
    });
  });

  it('throws, naming the unknown key, for an unregistered profile', () => {
    expect(() => resolveAuthProfile('not-a-real-profile')).toThrow(/not-a-real-profile/);
  });
});

describe('resolveAuthHeaderName', () => {
  it('defaults to "Cookie" for a profile with no headerName (e.g. "example-profile")', () => {
    expect(resolveAuthHeaderName('example-profile')).toBe('Cookie');
  });
});

describe('resolveAuthCredential', () => {
  it('returns the value of the profile-registered env var when set', async () => {
    const env = await envConfigWith({ SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: 'test-cookie-value' });
    expect(resolveAuthCredential('example-profile', env)).toBe('test-cookie-value');
  });

  it('throws, naming the env var and profile, when the env var is unset', async () => {
    const env = await envConfigWith({});
    expect(() => resolveAuthCredential('example-profile', env)).toThrow(/SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE/);
    expect(() => resolveAuthCredential('example-profile', env)).toThrow(/authProfile "example-profile"/);
  });

  it('throws, naming the env var and profile, when the env var is empty', async () => {
    const env = await envConfigWith({ SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: '' });
    expect(() => resolveAuthCredential('example-profile', env)).toThrow(/SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE/);
  });
});
