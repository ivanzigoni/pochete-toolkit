import { afterEach, describe, expect, it } from 'vitest';
import { EnvConfig } from '../../../../src/shared/env-config.js';
import {
  CONNECTION_PROFILE_KEYS,
  resolveConnectionPassword,
  resolveConnectionProfileIn,
} from '../../../../src/tools/safe-query/connection-profiles.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';

// Fixture-only registry — never the real, gitignored connection-profiles.json (see
// connection-profiles.example.json for its shape), so no real database's host/user ever appears
// as a literal in this test file.
/* eslint-disable sonarjs/no-hardcoded-passwords -- env var *names*, not values; test doubles, not real secrets */
const FAKE_REGISTRY = {
  cemiterio_dev: {
    engine: 'mssql' as const,
    host: 'db-dev.example.internal',
    database: 'Cemiterio_DEV',
    user: 'example_user',
    passwordEnvVar: 'SAFE_QUERY_CEM_HML_PASSWORD',
  },
  cemiterio_prd: {
    engine: 'mssql' as const,
    host: 'db.example.internal',
    database: 'Cemiterio',
    user: 'example_user',
    passwordEnvVar: 'SAFE_QUERY_CEM_PRD_PASSWORD',
  },
};
/* eslint-enable sonarjs/no-hardcoded-passwords */

const ENV_FILE_VAR = 'CEM_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

// resolveConnectionPassword reads via an EnvConfig instance, never process.env directly — so a
// test that wants a given password env var points CEM_MCP_ENV_FILE at its own temp file.
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

describe('CONNECTION_PROFILE_KEYS', () => {
  it('includes every connection registered in connection-profiles.json', () => {
    expect(CONNECTION_PROFILE_KEYS).toContain('cemiterio_dev');
    expect(CONNECTION_PROFILE_KEYS).toContain('cemiterio_prd');
  });
});

describe('resolveConnectionProfileIn', () => {
  it('resolves "cemiterio_dev", applying documented defaults for port/ssl/trustServerCert', () => {
    expect(resolveConnectionProfileIn(FAKE_REGISTRY, 'cemiterio_dev')).toEqual({
      engine: 'mssql',
      host: 'db-dev.example.internal',
      port: 1433,
      database: 'Cemiterio_DEV',
      user: 'example_user',
      ssl: false,
      trustServerCert: false,
    });
  });

  it('resolves "cemiterio_prd", applying documented defaults for port/ssl/trustServerCert', () => {
    expect(resolveConnectionProfileIn(FAKE_REGISTRY, 'cemiterio_prd')).toEqual({
      engine: 'mssql',
      host: 'db.example.internal',
      port: 1433,
      database: 'Cemiterio',
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
      /cemiterio_dev/,
    );
  });
});

describe('resolveConnectionPassword', () => {
  it('returns the value of the connection-registered env var when set', async () => {
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test double, not a real secret
    const env = await envConfigWith({ SAFE_QUERY_CEM_HML_PASSWORD: 'test-value-123' });
    expect(resolveConnectionPassword('cemiterio_dev', env)).toBe('test-value-123');
  });

  it('resolves each connection to its own, independently registered env var', async () => {
    /* eslint-disable sonarjs/no-hardcoded-passwords -- test doubles, not real secrets */
    const env = await envConfigWith({
      SAFE_QUERY_CEM_HML_PASSWORD: 'dev-value',
      SAFE_QUERY_CEM_PRD_PASSWORD: 'prd-value',
    });
    /* eslint-enable sonarjs/no-hardcoded-passwords */
    expect(resolveConnectionPassword('cemiterio_dev', env)).toBe('dev-value');
    expect(resolveConnectionPassword('cemiterio_prd', env)).toBe('prd-value');
  });

  it('throws, naming the env var and connection, when the env var is unset', async () => {
    const env = await envConfigWith({});
    expect(() => resolveConnectionPassword('cemiterio_dev', env)).toThrow(
      /SAFE_QUERY_CEM_HML_PASSWORD/,
    );
    expect(() => resolveConnectionPassword('cemiterio_dev', env)).toThrow(
      /connection "cemiterio_dev"/,
    );
  });

  it('throws, naming the env var and connection, when the env var is empty', async () => {
    const env = await envConfigWith({ SAFE_QUERY_CEM_HML_PASSWORD: '' });
    expect(() => resolveConnectionPassword('cemiterio_dev', env)).toThrow(
      /SAFE_QUERY_CEM_HML_PASSWORD/,
    );
  });

  it('throws, naming the unknown key, for an unregistered connection', async () => {
    const env = await envConfigWith({});
    expect(() => resolveConnectionPassword('not-a-real-connection', env)).toThrow(
      /not-a-real-connection/,
    );
  });
});
