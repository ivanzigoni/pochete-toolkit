import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  listConnectionProfileKeys,
  resolveConnectionPassword,
  resolveConnectionProfileIn,
} from '../../../../src/tools/safe-query/connection-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

// Fixture-only registry — never the real, gitignored config.json (see config.example.json for
// its shape), so no real database's host/user ever appears as a literal in this test file.
/* eslint-disable sonarjs/no-hardcoded-passwords -- env var *names*, not values; test doubles, not real secrets */
const FAKE_REGISTRY = {
  'example-connection': {
    engine: 'mssql' as const,
    host: 'db.example.internal',
    database: 'example_database',
    user: 'example_user',
    passwordEnvVar: 'SAFE_QUERY_EXAMPLE_CONNECTION_PASSWORD',
  },
};
/* eslint-enable sonarjs/no-hardcoded-passwords */

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

// resolveConnectionPassword reads via an EnvConfig instance, never process.env directly — so a
// test that wants a given password env var points POCHETE_MCP_ENV_FILE at its own temp file.
async function envConfigWith(vars: Record<string, string>): Promise<EnvConfig> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrentEnvFile = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return new EnvConfig('safe-query');
}

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrentEnvFile?.();
  cleanupCurrentEnvFile = undefined;
});

// listConnectionProfileKeys/resolveConnectionPassword (unlike resolveConnectionProfileIn above)
// read the real config.json instead of taking a registry parameter — point
// POCHETE_SAFE_QUERY_CONFIG_FILE at this fixture for the whole file so they see FAKE_REGISTRY
// too, never the real, gitignored config.json.
const CONFIG_FILE_VAR = 'POCHETE_SAFE_QUERY_CONFIG_FILE';
const originalConfigFileVar = process.env[CONFIG_FILE_VAR];
let cleanupConfigFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: configPath, cleanup } = await writeTempJsonFile('config.json', {
    connections: FAKE_REGISTRY,
    maskColumns: { partial: [], full: [] },
  });
  cleanupConfigFile = cleanup;
  process.env[CONFIG_FILE_VAR] = configPath;
});

afterAll(async () => {
  if (originalConfigFileVar === undefined) delete process.env[CONFIG_FILE_VAR];
  else process.env[CONFIG_FILE_VAR] = originalConfigFileVar;
  await cleanupConfigFile?.();
});

describe('listConnectionProfileKeys', () => {
  it('includes every connection registered in config.json', () => {
    expect(listConnectionProfileKeys()).toContain('example-connection');
  });
});

describe('resolveConnectionProfileIn', () => {
  it('resolves "example-connection", applying documented defaults for port/ssl/trustServerCert', () => {
    expect(resolveConnectionProfileIn(FAKE_REGISTRY, 'example-connection')).toEqual({
      engine: 'mssql',
      host: 'db.example.internal',
      port: 1433,
      database: 'example_database',
      user: 'example_user',
      ssl: false,
      trustServerCert: false,
    });
  });

  it('throws, naming the unknown key and the registered connections, for an unregistered connection', () => {
    expect(() => resolveConnectionProfileIn(FAKE_REGISTRY, 'not-a-real-connection')).toThrow(
      /not-a-real-connection/,
    );
    expect(() => resolveConnectionProfileIn(FAKE_REGISTRY, 'not-a-real-connection')).toThrow(
      /example-connection/,
    );
  });
});

describe('resolveConnectionPassword', () => {
  it('returns the value of the connection-registered env var when set', async () => {
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test double, not a real secret
    const env = await envConfigWith({ SAFE_QUERY_EXAMPLE_CONNECTION_PASSWORD: 'test-value-123' });
    expect(resolveConnectionPassword('example-connection', env)).toBe('test-value-123');
  });

  it('throws, naming the env var and connection, when the env var is unset', async () => {
    const env = await envConfigWith({});
    expect(() => resolveConnectionPassword('example-connection', env)).toThrow(
      /SAFE_QUERY_EXAMPLE_CONNECTION_PASSWORD/,
    );
    expect(() => resolveConnectionPassword('example-connection', env)).toThrow(
      /connection "example-connection"/,
    );
  });

  it('throws, naming the env var and connection, when the env var is empty', async () => {
    const env = await envConfigWith({ SAFE_QUERY_EXAMPLE_CONNECTION_PASSWORD: '' });
    expect(() => resolveConnectionPassword('example-connection', env)).toThrow(
      /SAFE_QUERY_EXAMPLE_CONNECTION_PASSWORD/,
    );
  });

  it('throws, naming the unknown key, for an unregistered connection', async () => {
    const env = await envConfigWith({});
    expect(() => resolveConnectionPassword('not-a-real-connection', env)).toThrow(
      /not-a-real-connection/,
    );
  });
});
