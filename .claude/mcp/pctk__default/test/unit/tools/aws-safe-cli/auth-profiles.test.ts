import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  listAuthProfileKeys,
  resolveAuthProfile,
  resolveAwsCredentials,
} from '../../../../src/tools/aws-safe-cli/auth-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

async function envConfigWith(vars: Record<string, string>): Promise<EnvConfig> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return new EnvConfig('aws-safe-cli');
}

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrentEnvFile?.();
  cleanupCurrentEnvFile = undefined;
});

// Fixture-only registry — never the real, gitignored auth-profiles.json.
const REGISTRY_FILE_VAR = 'POCHETE_AWS_SAFE_CLI_AUTH_PROFILES_FILE';
const originalRegistryFileVar = process.env[REGISTRY_FILE_VAR];
let cleanupRegistryFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: registryFilePath, cleanup } = await writeTempJsonFile('auth-profiles.json', {
    'example-account': {
      accessKeyIdEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID',
      secretAccessKeyEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY',
      region: 'us-east-1',
    },
    'example-account-with-session-token': {
      accessKeyIdEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID',
      secretAccessKeyEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY',
      sessionTokenEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SESSION_TOKEN',
      region: 'sa-east-1',
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
      expect.arrayContaining(['example-account', 'example-account-with-session-token']),
    );
  });
});

describe('resolveAuthProfile', () => {
  it('resolves a profile with no sessionTokenEnvVar', () => {
    expect(resolveAuthProfile('example-account')).toEqual({
      accessKeyIdEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID',
      secretAccessKeyEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY',
      region: 'us-east-1',
    });
  });

  it('resolves a profile with a sessionTokenEnvVar', () => {
    expect(resolveAuthProfile('example-account-with-session-token')).toMatchObject({
      sessionTokenEnvVar: 'AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SESSION_TOKEN',
      region: 'sa-east-1',
    });
  });

  it('throws, naming the unknown key, for an unregistered profile', () => {
    expect(() => resolveAuthProfile('not-a-real-profile')).toThrow(/not-a-real-profile/);
  });
});

describe('resolveAwsCredentials', () => {
  it('returns access key/secret and the profile region when no sessionTokenEnvVar is registered', async () => {
    const env = await envConfigWith({
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID: 'test-access-key-id',
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY: 'test-secret-access-key',
    });
    expect(resolveAwsCredentials('example-account', env)).toEqual({
      accessKeyId: 'test-access-key-id',
      secretAccessKey: 'test-secret-access-key',
      sessionToken: undefined,
      region: 'us-east-1',
    });
  });

  it('resolves the session token when the profile registers one', async () => {
    const env = await envConfigWith({
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID: 'test-access-key-id',
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY: 'test-secret-access-key',
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SESSION_TOKEN: 'test-session-token',
    });
    expect(resolveAwsCredentials('example-account-with-session-token', env)).toEqual({
      accessKeyId: 'test-access-key-id',
      secretAccessKey: 'test-secret-access-key',
      sessionToken: 'test-session-token',
      region: 'sa-east-1',
    });
  });

  it('throws, naming the env var and profile, when the access key env var is unset', async () => {
    const env = await envConfigWith({
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY: 'test-secret-access-key',
    });
    expect(() => resolveAwsCredentials('example-account', env)).toThrow(
      /AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID/,
    );
    expect(() => resolveAwsCredentials('example-account', env)).toThrow(
      /authProfile "example-account"/,
    );
  });

  it('throws, naming the env var, when the secret access key env var is unset', async () => {
    const env = await envConfigWith({
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID: 'test-access-key-id',
    });
    expect(() => resolveAwsCredentials('example-account', env)).toThrow(
      /AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY/,
    );
  });

  it('throws, naming the env var, when a registered sessionTokenEnvVar is unset', async () => {
    const env = await envConfigWith({
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_ACCESS_KEY_ID: 'test-access-key-id',
      AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SECRET_ACCESS_KEY: 'test-secret-access-key',
    });
    expect(() => resolveAwsCredentials('example-account-with-session-token', env)).toThrow(
      /AWS_SAFE_CLI_EXAMPLE_ACCOUNT_SESSION_TOKEN/,
    );
  });
});
