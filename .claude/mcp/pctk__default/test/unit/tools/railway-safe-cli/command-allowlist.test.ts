import { afterEach, describe, expect, it } from 'vitest';
import {
  loadCommandAllowlist,
  resolveCommandRule,
} from '../../../../src/tools/railway-safe-cli/command-allowlist.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const REGISTRY_FILE_VAR = 'POCHETE_RAILWAY_SAFE_CLI_COMMAND_ALLOWLIST_FILE';
const originalRegistryFileVar = process.env[REGISTRY_FILE_VAR];
let cleanupRegistryFile: (() => Promise<void>) | undefined;

async function useAllowlist(content: unknown): Promise<void> {
  const { path: registryFilePath, cleanup } = await writeTempJsonFile(
    'command-allowlist.json',
    content,
  );
  cleanupRegistryFile = cleanup;
  process.env[REGISTRY_FILE_VAR] = registryFilePath;
}

afterEach(async () => {
  if (originalRegistryFileVar === undefined) delete process.env[REGISTRY_FILE_VAR];
  else process.env[REGISTRY_FILE_VAR] = originalRegistryFileVar;
  await cleanupRegistryFile?.();
  cleanupRegistryFile = undefined;
});

describe('loadCommandAllowlist', () => {
  it('resolves to an empty object when the registry file does not exist (nothing enabled)', async () => {
    process.env[REGISTRY_FILE_VAR] = '/nonexistent/command-allowlist.json';
    expect(loadCommandAllowlist()).toEqual({});
  });

  it('returns the registered rules as written', async () => {
    await useAllowlist({ status: {}, logs: { requireFlag: '--json' } });
    expect(loadCommandAllowlist()).toEqual({ status: {}, logs: { requireFlag: '--json' } });
  });
});

describe('resolveCommandRule', () => {
  it('returns the rule for a registered subcommand', async () => {
    await useAllowlist({ status: { requireFlag: '--json' } });
    expect(resolveCommandRule('status')).toEqual({ requireFlag: '--json' });
  });

  it('throws, listing what is registered, for a subcommand absent from the allowlist', async () => {
    await useAllowlist({ status: {} });
    expect(() => resolveCommandRule('down')).toThrow(/"down"/);
    expect(() => resolveCommandRule('down')).toThrow(/status/);
  });

  it('throws with a "nothing is registered yet" message when the allowlist is empty', async () => {
    await useAllowlist({});
    expect(() => resolveCommandRule('status')).toThrow(/nothing is registered yet/);
  });

  it('stays denied (never allow-everything) when the registry file is malformed', async () => {
    const { path: registryFilePath, cleanup } = await writeTempJsonFile(
      'command-allowlist.json',
      'not-an-object',
    );
    cleanupRegistryFile = cleanup;
    process.env[REGISTRY_FILE_VAR] = registryFilePath;
    expect(() => resolveCommandRule('status')).toThrow();
  });
});
