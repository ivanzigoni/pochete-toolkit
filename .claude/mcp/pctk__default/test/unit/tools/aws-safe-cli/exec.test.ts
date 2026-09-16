// Exercises runAwsCommand against a real, locally-written executable fixture (not the real aws
// CLI) that echoes its own argv/env as JSON to stdout — verifies the argv this function builds
// (service, operation, args, then --region) and that credentials reach the child only via its
// environment, never as an argument, and that every other AWS credential-resolution source is
// stripped from the child env.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AwsExecError, runAwsCommand } from '../../../../src/tools/aws-safe-cli/exec.js';

let cleanupFixture: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanupFixture?.();
  cleanupFixture = undefined;
});

async function writeEchoFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pochete-aws-fixture-'));
  cleanupFixture = () => rm(dir, { recursive: true, force: true });
  const scriptPath = path.join(dir, 'fake-aws.mjs');
  await writeFile(
    scriptPath,
    '#!/usr/bin/env node\n' +
      'process.stdout.write(JSON.stringify({\n' +
      '  argv: process.argv.slice(2),\n' +
      "  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',\n" +
      "  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',\n" +
      "  AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN || '',\n" +
      "  AWS_REGION: process.env.AWS_REGION || '',\n" +
      "  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION || '',\n" +
      "  AWS_PROFILE: process.env.AWS_PROFILE || '',\n" +
      "  AWS_SHARED_CREDENTIALS_FILE: process.env.AWS_SHARED_CREDENTIALS_FILE || '',\n" +
      "  AWS_CONFIG_FILE: process.env.AWS_CONFIG_FILE || '',\n" +
      "  AWS_EC2_METADATA_DISABLED: process.env.AWS_EC2_METADATA_DISABLED || '',\n" +
      '}));\n',
    { mode: 0o755 },
  );
  return scriptPath;
}

async function writeExitCodeFixture(code: number): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pochete-aws-fixture-'));
  cleanupFixture = () => rm(dir, { recursive: true, force: true });
  const scriptPath = path.join(dir, 'fake-aws.mjs');
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node\nprocess.stderr.write('on stderr\\n');\nprocess.exit(${code});\n`,
    { mode: 0o755 },
  );
  return scriptPath;
}

const baseParams = {
  service: 'sts',
  operation: 'get-caller-identity',
  args: [] as string[],
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-value',
  sessionToken: undefined as string | undefined,
  region: 'us-east-1',
  timeoutMs: undefined as number | undefined,
};

describe('runAwsCommand', () => {
  it('builds argv as service, operation, args, then --region', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runAwsCommand({ ...baseParams, binaryPath, args: ['--output', 'json'] });
    const parsed = JSON.parse(result.stdout) as { argv: string[] };
    expect(parsed.argv).toEqual([
      'sts',
      'get-caller-identity',
      '--output',
      'json',
      '--region',
      'us-east-1',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('injects access key/secret into the child env, never in argv', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runAwsCommand({ ...baseParams, binaryPath });
    const parsed = JSON.parse(result.stdout) as {
      argv: string[];
      AWS_ACCESS_KEY_ID: string;
      AWS_SECRET_ACCESS_KEY: string;
    };
    expect(parsed.AWS_ACCESS_KEY_ID).toBe('AKIAEXAMPLE');
    expect(parsed.AWS_SECRET_ACCESS_KEY).toBe('secret-value');
    expect(parsed.argv.join(' ')).not.toContain('AKIAEXAMPLE');
    expect(parsed.argv.join(' ')).not.toContain('secret-value');
  });

  it('injects the session token when provided', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runAwsCommand({
      ...baseParams,
      binaryPath,
      sessionToken: 'session-token-value',
    });
    const parsed = JSON.parse(result.stdout) as { AWS_SESSION_TOKEN: string };
    expect(parsed.AWS_SESSION_TOKEN).toBe('session-token-value');
  });

  it('sets AWS_REGION/AWS_DEFAULT_REGION and disables IMDS fallback', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runAwsCommand({ ...baseParams, binaryPath });
    const parsed = JSON.parse(result.stdout) as {
      AWS_REGION: string;
      AWS_DEFAULT_REGION: string;
      AWS_EC2_METADATA_DISABLED: string;
    };
    expect(parsed.AWS_REGION).toBe('us-east-1');
    expect(parsed.AWS_DEFAULT_REGION).toBe('us-east-1');
    expect(parsed.AWS_EC2_METADATA_DISABLED).toBe('true');
  });

  it('strips inherited AWS_PROFILE/AWS_SHARED_CREDENTIALS_FILE/AWS_CONFIG_FILE/AWS_SESSION_TOKEN from the child env', async () => {
    const binaryPath = await writeEchoFixture();
    process.env.AWS_PROFILE = 'inherited-profile';
    process.env.AWS_SHARED_CREDENTIALS_FILE = '/inherited/credentials';
    process.env.AWS_CONFIG_FILE = '/inherited/config';
    process.env.AWS_SESSION_TOKEN = 'inherited-session-token';
    try {
      const result = await runAwsCommand({ ...baseParams, binaryPath });
      const parsed = JSON.parse(result.stdout) as {
        AWS_PROFILE: string;
        AWS_SHARED_CREDENTIALS_FILE: string;
        AWS_CONFIG_FILE: string;
        AWS_SESSION_TOKEN: string;
      };
      expect(parsed.AWS_PROFILE).toBe('');
      expect(parsed.AWS_SHARED_CREDENTIALS_FILE).toBe('');
      expect(parsed.AWS_CONFIG_FILE).toBe('');
      expect(parsed.AWS_SESSION_TOKEN).toBe('');
    } finally {
      delete process.env.AWS_PROFILE;
      delete process.env.AWS_SHARED_CREDENTIALS_FILE;
      delete process.env.AWS_CONFIG_FILE;
      delete process.env.AWS_SESSION_TOKEN;
    }
  });

  it('resolves (does not reject) with the CLI-reported exit code on a non-zero exit', async () => {
    const binaryPath = await writeExitCodeFixture(254);
    const result = await runAwsCommand({ ...baseParams, binaryPath });
    expect(result.exitCode).toBe(254);
    expect(result.stderr).toContain('on stderr');
  });

  it('rejects with AwsExecError when the binary does not exist', async () => {
    await expect(
      runAwsCommand({ ...baseParams, binaryPath: '/nonexistent/aws-binary' }),
    ).rejects.toThrow(AwsExecError);
  });
});
