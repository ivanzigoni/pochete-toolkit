import { writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { EnvConfig } from '../../../src/shared/env-config.js';
import { writeTempEnvFile } from '../../helpers/env-file.js';

const ENV_FILE_VAR = 'POCHETE_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrent: (() => Promise<void>) | undefined;

async function pointAt(vars: Record<string, string>): Promise<string> {
  const { path: envPath, cleanup } = await writeTempEnvFile(vars);
  cleanupCurrent = cleanup;
  process.env[ENV_FILE_VAR] = envPath;
  return envPath;
}

afterEach(async () => {
  if (originalEnvFileVar === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = originalEnvFileVar;
  await cleanupCurrent?.();
  cleanupCurrent = undefined;
});

describe('EnvConfig.getRaw', () => {
  it('returns the configured value', async () => {
    await pointAt({ SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: 'test-cookie-value' });

    expect(new EnvConfig('safe-curl').getRaw('SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE')).toBe(
      'test-cookie-value',
    );
  });

  it('returns undefined for a var absent from the file', async () => {
    await pointAt({});

    expect(new EnvConfig('safe-curl').getRaw('SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE')).toBeUndefined();
  });

  it('treats a missing .env file as fully empty rather than throwing at construction', async () => {
    process.env[ENV_FILE_VAR] = '/nonexistent/path/.env';

    expect(() => new EnvConfig('safe-curl')).not.toThrow();
    expect(new EnvConfig('safe-curl').getRaw('ANYTHING')).toBeUndefined();
  });
});

describe('freshness — no restart, no process.env, no caching', () => {
  it('reflects a value changed on disk between two instantiations, with no restart', async () => {
    const envPath = await pointAt({ SOME_VAR: '100' });
    expect(new EnvConfig('safe-query').getRaw('SOME_VAR')).toBe('100');

    await writeFile(envPath, 'SOME_VAR="200"', 'utf8');

    expect(new EnvConfig('safe-query').getRaw('SOME_VAR')).toBe('200');
  });

  it('never writes anything into process.env', async () => {
    await pointAt({ SOME_VAR: '100' });
    delete process.env.SOME_VAR;

    const value = new EnvConfig('safe-query').getRaw('SOME_VAR');

    expect(value).toBe('100');
    expect(process.env.SOME_VAR).toBeUndefined();
  });
});

describe('per-tool path resolution (no POCHETE_MCP_ENV_FILE override)', () => {
  it('resolves to src/tools/<toolName>/.env and tolerates it not existing, rather than throwing', () => {
    delete process.env[ENV_FILE_VAR];

    expect(() => new EnvConfig('a-tool-name-that-does-not-exist')).not.toThrow();
    expect(new EnvConfig('a-tool-name-that-does-not-exist').getRaw('ANYTHING')).toBeUndefined();
  });
});
