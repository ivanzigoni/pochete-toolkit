// Covers railway-safe-cli end to end through the real MCP server process — token injection from
// the authProfile's registered env var, fixed --project/--environment appended server-side, the
// command-allowlist.json gate, the args scope-override rejection, and a non-zero CLI exit code
// surfacing as a normal (non-isError) result. The real railway CLI is never involved: RAILWAY_CLI_PATH
// points the child process at test/fixtures/fake-railway.mjs instead, same "spawn the real server,
// fake only the external driver" approach as test/e2e/safe-curl.test.ts uses for undici.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';
import { writeTempJsonFile } from '../helpers/json-file.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CALL_TOOL_MJS = path.join(SERVER_ROOT, 'bin', 'call-tool.mjs');
const FAKE_RAILWAY = path.join(SERVER_ROOT, 'test', 'fixtures', 'fake-railway.mjs');

const FAKE_AUTH_PROFILES = {
  'example-project': {
    envVar: 'RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN',
    projectId: 'project-1',
    environmentId: 'environment-1',
  },
  'example-project-with-service': {
    envVar: 'RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN',
    projectId: 'project-2',
    environmentId: 'environment-2',
    serviceId: 'service-2',
  },
};

const FAKE_COMMAND_ALLOWLIST = {
  status: {},
  down: { forbidLongFlags: ['--yes'] },
};

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function callRailwayCli(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup: cleanupEnvFile } = await writeTempEnvFile({
    RAILWAY_CLI_PATH: FAKE_RAILWAY,
    ...envOverrides,
  });
  const { path: authProfilesFile, cleanup: cleanupAuthProfilesFile } = await writeTempJsonFile(
    'auth-profiles.json',
    FAKE_AUTH_PROFILES,
  );
  const { path: allowlistFile, cleanup: cleanupAllowlistFile } = await writeTempJsonFile(
    'command-allowlist.json',
    FAKE_COMMAND_ALLOWLIST,
  );
  const cleanup = async () => {
    await cleanupEnvFile();
    await cleanupAuthProfilesFile();
    await cleanupAllowlistFile();
  };
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        POCHETE_MCP_ENV_FILE: envFile,
        POCHETE_RAILWAY_SAFE_CLI_AUTH_PROFILES_FILE: authProfilesFile,
        POCHETE_RAILWAY_SAFE_CLI_COMMAND_ALLOWLIST_FILE: allowlistFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'railway-safe-cli'], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));

      child.stdin.write(JSON.stringify({ authProfile: 'example-project', ...toolArguments }));
      child.stdin.end();
    });
  } finally {
    await cleanup();
  }
}

describe('railway-safe-cli (via call-tool.mjs against the real MCP server)', () => {
  it('runs an allowlisted command, injecting the token and fixed project/environment', async () => {
    const { stdout, exitCode } = await callRailwayCli(
      { command: 'status', args: ['--json'] },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.exitCode).toBe(0);
    const fakeOutput = JSON.parse(payload.stdout);
    expect(fakeOutput.argv).toEqual([
      'status',
      '--json',
      '--project',
      'project-1',
      '--environment',
      'environment-1',
    ]);
    expect(fakeOutput.RAILWAY_TOKEN).toBe('test-token-value');
  });

  it('appends --service for a profile that registers one', async () => {
    const { stdout, exitCode } = await callRailwayCli(
      { command: 'status', authProfile: 'example-project-with-service' },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    const fakeOutput = JSON.parse(payload.stdout);
    expect(fakeOutput.argv).toEqual([
      'status',
      '--project',
      'project-2',
      '--environment',
      'environment-2',
      '--service',
      'service-2',
    ]);
  });

  it('never runs the CLI for a command absent from command-allowlist.json', async () => {
    const { stderr, exitCode } = await callRailwayCli(
      { command: 'service-delete' },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('"service-delete"');
    expect(stderr).toContain('not enabled');
  });

  it('rejects args that try to override --project, naming it, without running the CLI', async () => {
    const { stderr, exitCode } = await callRailwayCli(
      { command: 'status', args: ['--project', 'someone-elses-project'] },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--project');
  });

  it('rejects a forbidden flag on an allowlisted command', async () => {
    const { stderr, exitCode } = await callRailwayCli(
      { command: 'down', args: ['--yes'] },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--yes');
  });

  it('rejects when the authProfile env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callRailwayCli(
      { command: 'status' },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN');
    expect(stderr).toContain('authProfile "example-project"');
  });

  it('rejects an unregistered authProfile', async () => {
    const { stderr, exitCode } = await callRailwayCli(
      { command: 'status', authProfile: 'not-a-real-profile' },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('authProfile');
  });

  it('returns a non-zero CLI exit code as a normal result, not a tool error', async () => {
    const { stdout, exitCode } = await callRailwayCli(
      { command: 'status', args: ['--fail'] },
      { RAILWAY_SAFE_CLI_EXAMPLE_PROJECT_TOKEN: 'test-token-value' },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.exitCode).toBe(7);
    expect(payload.stderr).toContain('simulated railway CLI failure');
  });
});
