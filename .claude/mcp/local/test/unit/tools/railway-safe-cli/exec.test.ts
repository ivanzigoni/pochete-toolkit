// Exercises runRailwayCommand against a real, locally-written executable fixture (not the real
// railway CLI) that echoes its own argv/env as JSON to stdout — verifies the argv this function
// builds (command, args, then --project/--environment/--service) and that the token reaches the
// child only via its environment, never as an argument.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RailwayExecError,
  runRailwayCommand,
} from '../../../../src/tools/railway-safe-cli/exec.js';

let cleanupFixture: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanupFixture?.();
  cleanupFixture = undefined;
});

async function writeEchoFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pochete-railway-fixture-'));
  cleanupFixture = () => rm(dir, { recursive: true, force: true });
  const scriptPath = path.join(dir, 'fake-railway.mjs');
  await writeFile(
    scriptPath,
    '#!/usr/bin/env node\n' +
      'process.stdout.write(JSON.stringify({\n' +
      '  argv: process.argv.slice(2),\n' +
      "  RAILWAY_TOKEN: process.env.RAILWAY_TOKEN || '',\n" +
      "  RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN || '',\n" +
      '}));\n',
    { mode: 0o755 },
  );
  return scriptPath;
}

async function writeExitCodeFixture(code: number): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pochete-railway-fixture-'));
  cleanupFixture = () => rm(dir, { recursive: true, force: true });
  const scriptPath = path.join(dir, 'fake-railway.mjs');
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node\nprocess.stderr.write('on stderr\\n');\nprocess.exit(${code});\n`,
    { mode: 0o755 },
  );
  return scriptPath;
}

describe('runRailwayCommand', () => {
  it('builds argv as command, args, then --project/--environment (no serviceId)', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runRailwayCommand({
      binaryPath,
      command: 'status',
      args: ['--json'],
      projectId: 'project-1',
      environmentId: 'environment-1',
      serviceId: undefined,
      token: 'test-token',
      timeoutMs: undefined,
    });
    const parsed = JSON.parse(result.stdout) as { argv: string[]; RAILWAY_TOKEN: string };
    expect(parsed.argv).toEqual([
      'status',
      '--json',
      '--project',
      'project-1',
      '--environment',
      'environment-1',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('appends --service when serviceId is set', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runRailwayCommand({
      binaryPath,
      command: 'logs',
      args: [],
      projectId: 'project-1',
      environmentId: 'environment-1',
      serviceId: 'service-1',
      token: 'test-token',
      timeoutMs: undefined,
    });
    const parsed = JSON.parse(result.stdout) as { argv: string[] };
    expect(parsed.argv).toEqual([
      'logs',
      '--project',
      'project-1',
      '--environment',
      'environment-1',
      '--service',
      'service-1',
    ]);
  });

  it('injects the token into the child env as RAILWAY_TOKEN, never in argv', async () => {
    const binaryPath = await writeEchoFixture();
    const result = await runRailwayCommand({
      binaryPath,
      command: 'status',
      args: [],
      projectId: 'project-1',
      environmentId: 'environment-1',
      serviceId: undefined,
      token: 'super-secret-token',
      timeoutMs: undefined,
    });
    const parsed = JSON.parse(result.stdout) as { argv: string[]; RAILWAY_TOKEN: string };
    expect(parsed.RAILWAY_TOKEN).toBe('super-secret-token');
    expect(parsed.argv.join(' ')).not.toContain('super-secret-token');
  });

  it('strips an inherited RAILWAY_API_TOKEN from the child env', async () => {
    const binaryPath = await writeEchoFixture();
    process.env.RAILWAY_API_TOKEN = 'account-wide-token';
    try {
      const result = await runRailwayCommand({
        binaryPath,
        command: 'status',
        args: [],
        projectId: 'project-1',
        environmentId: 'environment-1',
        serviceId: undefined,
        token: 'project-token',
        timeoutMs: undefined,
      });
      const parsed = JSON.parse(result.stdout) as { RAILWAY_API_TOKEN: string };
      expect(parsed.RAILWAY_API_TOKEN).toBe('');
    } finally {
      delete process.env.RAILWAY_API_TOKEN;
    }
  });

  it('resolves (does not reject) with the CLI-reported exit code on a non-zero exit', async () => {
    const binaryPath = await writeExitCodeFixture(3);
    const result = await runRailwayCommand({
      binaryPath,
      command: 'down',
      args: [],
      projectId: 'project-1',
      environmentId: 'environment-1',
      serviceId: undefined,
      token: 'test-token',
      timeoutMs: undefined,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('on stderr');
  });

  it('rejects with RailwayExecError when the binary does not exist', async () => {
    await expect(
      runRailwayCommand({
        binaryPath: '/nonexistent/railway-binary',
        command: 'status',
        args: [],
        projectId: 'project-1',
        environmentId: 'environment-1',
        serviceId: undefined,
        token: 'test-token',
        timeoutMs: undefined,
      }),
    ).rejects.toThrow(RailwayExecError);
  });
});
