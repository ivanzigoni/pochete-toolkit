import { afterEach, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  AUTH_PROFILE_KEYS,
  resolveAuthCredential,
  resolveAuthHeaderName,
  resolveAuthProfile,
} from '../../../../src/tools/safe-curl/auth-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';

const ENV_FILE_VAR = 'CEM_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

// resolveAuthCredential reads via an EnvConfig instance, never process.env directly — so a test that
// wants a given CEM_SAFE_CURL_PRD_AUTH_COOKIE points CEM_MCP_ENV_FILE at its own temp file instead.
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

describe('AUTH_PROFILE_KEYS', () => {
  it('includes the "cem" profile registered in auth-profiles.json', () => {
    expect(AUTH_PROFILE_KEYS).toContain('cem');
  });
});

describe('resolveAuthProfile', () => {
  it('resolves the "cem" profile to its envVar', () => {
    expect(resolveAuthProfile('cem')).toEqual({
      envVar: 'CEM_SAFE_CURL_PRD_AUTH_COOKIE',
    });
  });

  it('throws, naming the unknown key, for an unregistered profile', () => {
    expect(() => resolveAuthProfile('not-a-real-profile')).toThrow(/not-a-real-profile/);
  });
});

describe('resolveAuthHeaderName', () => {
  it('defaults to "Cookie" for a profile with no headerName (e.g. "cem")', () => {
    expect(resolveAuthHeaderName('cem')).toBe('Cookie');
  });
});

describe('resolveAuthCredential', () => {
  it('returns the value of the profile-registered env var when set', async () => {
    const env = await envConfigWith({ CEM_SAFE_CURL_PRD_AUTH_COOKIE: 'test-cookie-value' });
    expect(resolveAuthCredential('cem', env)).toBe('test-cookie-value');
  });

  it('throws, naming the env var and profile, when the env var is unset', async () => {
    const env = await envConfigWith({});
    expect(() => resolveAuthCredential('cem', env)).toThrow(/CEM_SAFE_CURL_PRD_AUTH_COOKIE/);
    expect(() => resolveAuthCredential('cem', env)).toThrow(/authProfile "cem"/);
  });

  it('throws, naming the env var and profile, when the env var is empty', async () => {
    const env = await envConfigWith({ CEM_SAFE_CURL_PRD_AUTH_COOKIE: '' });
    expect(() => resolveAuthCredential('cem', env)).toThrow(/CEM_SAFE_CURL_PRD_AUTH_COOKIE/);
  });
});
