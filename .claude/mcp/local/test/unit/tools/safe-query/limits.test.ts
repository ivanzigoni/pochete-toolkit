import { writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { EnvConfig } from '../../../../src/shared/env-config.js';
import { resolveSafeQueryLimits } from '../../../../src/tools/safe-query/limits.js';
import { writeTempEnvFile } from '../../../helpers/env-file.js';

const ENV_FILE_VAR = 'CEM_MCP_ENV_FILE';
const originalEnvFileVar = process.env[ENV_FILE_VAR];
let cleanupCurrentEnvFile: (() => Promise<void>) | undefined;

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

describe('resolveSafeQueryLimits', () => {
  it('applies documented defaults when both vars are unset', async () => {
    const env = await envConfigWith({});

    expect(resolveSafeQueryLimits(env)).toEqual({ timeoutSeconds: 30, maxRows: 10_000 });
  });

  it('coerces both vars to number when set', async () => {
    const env = await envConfigWith({
      SAFE_QUERY_TIMEOUT_SECONDS: '60',
      SAFE_QUERY_MAX_ROWS: '500',
    });

    expect(resolveSafeQueryLimits(env)).toEqual({ timeoutSeconds: 60, maxRows: 500 });
  });

  it('treats a missing .env file as fully defaulted rather than throwing at construction', async () => {
    process.env[ENV_FILE_VAR] = '/nonexistent/path/.env';

    expect(() => new EnvConfig('safe-query')).not.toThrow();
    expect(resolveSafeQueryLimits(new EnvConfig('safe-query'))).toEqual({
      timeoutSeconds: 30,
      maxRows: 10_000,
    });
  });

  it('reflects a value changed on disk between two instantiations, with no restart', async () => {
    const { path: envPath, cleanup } = await writeTempEnvFile({ SAFE_QUERY_MAX_ROWS: '100' });
    cleanupCurrentEnvFile = cleanup;
    process.env[ENV_FILE_VAR] = envPath;

    expect(resolveSafeQueryLimits(new EnvConfig('safe-query')).maxRows).toBe(100);

    await writeFile(envPath, 'SAFE_QUERY_MAX_ROWS="200"', 'utf8');

    expect(resolveSafeQueryLimits(new EnvConfig('safe-query')).maxRows).toBe(200);
  });

  it('never writes anything into process.env', async () => {
    await envConfigWith({ SAFE_QUERY_MAX_ROWS: '100' });
    delete process.env.SAFE_QUERY_MAX_ROWS;

    const env = new EnvConfig('safe-query');
    const limits = resolveSafeQueryLimits(env);

    expect(limits.maxRows).toBe(100);
    expect(process.env.SAFE_QUERY_MAX_ROWS).toBeUndefined();
  });
});
