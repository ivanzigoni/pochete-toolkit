import { afterEach, describe, expect, it } from 'vitest';
import {
  loadCommandAllowlist,
  resolveCommandRule,
} from '../../../../src/tools/aws-safe-cli/command-allowlist.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

const REGISTRY_FILE_VAR = 'POCHETE_AWS_SAFE_CLI_COMMAND_ALLOWLIST_FILE';
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
    await useAllowlist({
      'sts get-caller-identity': {},
      's3 ls': { requireFlag: '--no-sign-request' },
    });
    expect(loadCommandAllowlist()).toEqual({
      'sts get-caller-identity': {},
      's3 ls': { requireFlag: '--no-sign-request' },
    });
  });
});

describe('resolveCommandRule', () => {
  it('returns the rule for a registered service+operation pair', async () => {
    await useAllowlist({ 'sts get-caller-identity': { verbRule: { bareAllowed: true } } });
    expect(resolveCommandRule('sts', 'get-caller-identity')).toEqual({
      verbRule: { bareAllowed: true },
    });
  });

  it('throws, naming the unregistered pair, when the operation is absent from the allowlist', async () => {
    await useAllowlist({ 'sts get-caller-identity': {} });
    expect(() => resolveCommandRule('ec2', 'terminate-instances')).toThrow(
      /"ec2 terminate-instances"/,
    );
    expect(() => resolveCommandRule('ec2', 'terminate-instances')).toThrow(
      /sts get-caller-identity/,
    );
  });

  it('does not conflate two operations of the same service', async () => {
    await useAllowlist({ 's3 ls': {} });
    expect(() => resolveCommandRule('s3', 'rm')).toThrow(/"s3 rm"/);
  });

  it('throws with a "nothing is registered yet" message when the allowlist is empty', async () => {
    await useAllowlist({});
    expect(() => resolveCommandRule('sts', 'get-caller-identity')).toThrow(
      /nothing is registered yet/,
    );
  });

  it('stays denied (never allow-everything) when the registry file is malformed', async () => {
    const { path: registryFilePath, cleanup } = await writeTempJsonFile(
      'command-allowlist.json',
      'not-an-object',
    );
    cleanupRegistryFile = cleanup;
    process.env[REGISTRY_FILE_VAR] = registryFilePath;
    expect(() => resolveCommandRule('sts', 'get-caller-identity')).toThrow();
  });
});
