// Covers bitbucket-deploy-logs end to end through the real MCP server process — Basic-auth header
// construction from the "example-profile" authProfile's registered env vars, the missing-env-var
// error path, the unregistered-authProfile error path, the no-pipeline-found path, the steps
// pagination follow (`next`), and a step log fetch failure — the same "spawn the real server, fake
// only the external driver" approach as test/e2e/bitbucket-open-pr.test.ts, with `undici` faked via
// test/fixtures/fake-undici.mjs (extended with the pipelines/steps/log branches for this suite).
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';
import { writeTempJsonFile } from '../helpers/json-file.js';

// Mirrors the constants of the same name in test/fixtures/fake-undici.mjs — not imported from
// there (a .mjs fixture has no type declarations; importing it would fail typecheck, same
// reasoning as test/e2e/portainer-get-container-logs.test.ts).
const DEPLOY_LOGS_VALID_COMMIT = 'deadbeefcafe1234567890abcdef1234567890';
const DEPLOY_LOGS_NO_PIPELINE_COMMIT = 'no-pipeline-commit';
const DEPLOY_LOGS_LOG_FAILURE_COMMIT = 'log-failure-commit';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CALL_TOOL_MJS = path.join(SERVER_ROOT, 'bin', 'call-tool.mjs');
const REGISTER_FAKE_DRIVERS = path.join(
  SERVER_ROOT,
  'test',
  'fixtures',
  'register-fake-drivers.mjs',
);

const EMAIL = 'dev@example.com';
const API_TOKEN = 'test-token-value';

// Injected via POCHETE_BITBUCKET_DEPLOY_LOGS_AUTH_PROFILES_FILE into the spawned server process
// below — the same shape as the real, gitignored auth-profiles.json (see
// auth-profiles.example.json).
const FAKE_AUTH_PROFILES = {
  'example-profile': {
    emailEnvVar: 'DEPLOY_LOGS_EXAMPLE_PROFILE_EMAIL',
    apiTokenEnvVar: 'DEPLOY_LOGS_EXAMPLE_PROFILE_API_TOKEN',
  },
};

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

// envOverrides is written to an isolated temp .env file (test/helpers/env-file.ts) that the
// child is pointed at via POCHETE_MCP_ENV_FILE — never the real .env, never process.env directly
// (EnvConfig reads neither). Passing '' for a var (rather than omitting it) is what simulates
// "configured but blank", regardless of whether a real .env with this var sits on disk.
async function callBitbucketDeployLogs(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup: cleanupEnvFile } = await writeTempEnvFile(envOverrides);
  const { path: authProfilesFile, cleanup: cleanupAuthProfilesFile } = await writeTempJsonFile(
    'auth-profiles.json',
    FAKE_AUTH_PROFILES,
  );
  const cleanup = async () => {
    await cleanupEnvFile();
    await cleanupAuthProfilesFile();
  };
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(REGISTER_FAKE_DRIVERS).href}`,
        POCHETE_MCP_ENV_FILE: envFile,
        POCHETE_BITBUCKET_DEPLOY_LOGS_AUTH_PROFILES_FILE: authProfilesFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'bitbucket-deploy-logs'], { env });
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

      child.stdin.write(
        JSON.stringify({
          authProfile: 'example-profile',
          workspace: 'my-workspace',
          repoSlug: 'my-repo',
          commitHash: DEPLOY_LOGS_VALID_COMMIT,
          ...toolArguments,
        }),
      );
      child.stdin.end();
    });
  } finally {
    await cleanup();
  }
}

const ENV_WITH_CREDENTIALS = {
  DEPLOY_LOGS_EXAMPLE_PROFILE_EMAIL: EMAIL,
  DEPLOY_LOGS_EXAMPLE_PROFILE_API_TOKEN: API_TOKEN,
};

describe('bitbucket-deploy-logs (via call-tool.mjs against the real MCP server)', () => {
  it('resolves the pipeline for the commit, follows steps pagination, and concatenates each step log', async () => {
    const { stdout, exitCode } = await callBitbucketDeployLogs({}, ENV_WITH_CREDENTIALS);
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.commitHash).toBe(DEPLOY_LOGS_VALID_COMMIT);
    expect(payload.buildNumber).toBe(7);
    expect(payload.pipelineState).toBe('COMPLETED');
    expect(payload.steps).toEqual([
      { uuid: 'step-build', name: 'Build', state: 'SUCCESSFUL' },
      { uuid: 'step-deploy', name: 'Deploy', state: 'SUCCESSFUL' },
    ]);
    expect(payload.logs).toContain('=== Build (SUCCESSFUL) ===\nbuilding...');
    expect(payload.logs).toContain('=== Deploy (SUCCESSFUL) ===\ndeploying...');
  });

  it('rejects when no pipeline is found for the given commit', async () => {
    const { stderr, exitCode } = await callBitbucketDeployLogs(
      { commitHash: DEPLOY_LOGS_NO_PIPELINE_COMMIT },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('no pipeline found');
    expect(stderr).toContain(DEPLOY_LOGS_NO_PIPELINE_COMMIT);
  });

  it('rejects when a step log fetch fails, naming the step', async () => {
    const { stderr, exitCode } = await callBitbucketDeployLogs(
      { commitHash: DEPLOY_LOGS_LOG_FAILURE_COMMIT },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Deploy');
  });

  it('rejects when the "example-profile" authProfile email env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callBitbucketDeployLogs(
      {},
      { ...ENV_WITH_CREDENTIALS, DEPLOY_LOGS_EXAMPLE_PROFILE_EMAIL: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('DEPLOY_LOGS_EXAMPLE_PROFILE_EMAIL');
    expect(stderr).toContain('authProfile "example-profile"');
  });

  it('rejects when the "example-profile" authProfile API token env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callBitbucketDeployLogs(
      {},
      { ...ENV_WITH_CREDENTIALS, DEPLOY_LOGS_EXAMPLE_PROFILE_API_TOKEN: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('DEPLOY_LOGS_EXAMPLE_PROFILE_API_TOKEN');
    expect(stderr).toContain('authProfile "example-profile"');
  });

  it('rejects an unregistered authProfile', async () => {
    const { stderr, exitCode } = await callBitbucketDeployLogs(
      { authProfile: 'not-a-real-profile' },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('authProfile');
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'bitbucket-deploy-logs');

    afterEach(async () => {
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns it as the summary plus the written path', async () => {
      const { stdout, exitCode } = await callBitbucketDeployLogs(
        { outputFileName: 'e2e-result.json' },
        ENV_WITH_CREDENTIALS,
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.buildNumber).toBe(7);

      const written = JSON.parse(await readFile(summary.outputPath, 'utf8'));
      expect(written.buildNumber).toBe(7);
    });
  });
});
