import { afterEach, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  AUTH_PROFILE_KEYS,
  resolveAuthProfile,
  resolveCredentials,
} from '../../../../src/tools/bitbucket-open-pr/auth-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';

const ENV_FILE_VAR = 'CEM_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

// resolveCredentials reads via an EnvConfig instance, never process.env directly — so a test
// that wants given credential env vars points CEM_MCP_ENV_FILE at its own temp file instead.
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

describe('AUTH_PROFILE_KEYS', () => {
  it('includes the "cem" profile registered in auth-profiles.json', () => {
    expect(AUTH_PROFILE_KEYS).toContain('cem');
  });
});

describe('resolveAuthProfile', () => {
  it('resolves the "cem" profile to its email/token env var names', () => {
    expect(resolveAuthProfile('cem')).toEqual({
      emailEnvVar: 'OPEN_PULL_REQUEST_BITBUCKET_EMAIL',
      apiTokenEnvVar: 'OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN',
    });
  });

  it('throws, naming the unknown key, for an unregistered profile', () => {
    expect(() => resolveAuthProfile('not-a-real-profile')).toThrow(/not-a-real-profile/);
  });
});

describe('resolveCredentials', () => {
  it('returns email and apiToken from the profile-registered env vars when both are set', async () => {
    const env = await envConfigWith({
      OPEN_PULL_REQUEST_BITBUCKET_EMAIL: 'dev@example.com',
      OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN: 'test-token-value',
    });
    expect(resolveCredentials('cem', env)).toEqual({
      email: 'dev@example.com',
      apiToken: 'test-token-value',
    });
  });

  it('throws, naming the env var and profile, when the email env var is unset', async () => {
    const env = await envConfigWith({
      OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN: 'test-token-value',
    });
    expect(() => resolveCredentials('cem', env)).toThrow(/OPEN_PULL_REQUEST_BITBUCKET_EMAIL/);
    expect(() => resolveCredentials('cem', env)).toThrow(/authProfile "cem"/);
  });

  it('throws, naming the env var and profile, when the token env var is unset', async () => {
    const env = await envConfigWith({ OPEN_PULL_REQUEST_BITBUCKET_EMAIL: 'dev@example.com' });
    expect(() => resolveCredentials('cem', env)).toThrow(/OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN/);
    expect(() => resolveCredentials('cem', env)).toThrow(/authProfile "cem"/);
  });

  it('throws when the email env var is empty', async () => {
    const env = await envConfigWith({
      OPEN_PULL_REQUEST_BITBUCKET_EMAIL: '',
      OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN: 'test-token-value',
    });
    expect(() => resolveCredentials('cem', env)).toThrow(/OPEN_PULL_REQUEST_BITBUCKET_EMAIL/);
  });
});
