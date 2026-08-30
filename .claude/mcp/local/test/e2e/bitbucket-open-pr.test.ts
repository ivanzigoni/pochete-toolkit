// Covers bitbucket-open-pr end to end through the real MCP server process — Basic-auth header
// construction from the "cem" authProfile's registered env vars, the missing-env-var error path,
// the unregistered-authProfile error path, and the Bitbucket error-response path — the same
// "spawn the real server, fake only the external driver" approach as test/e2e/safe-curl.test.ts,
// with `undici` faked via test/fixtures/fake-undici.mjs (extended with a Bitbucket
// pullrequests branch for this suite).
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';

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

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

// envOverrides is written to an isolated temp .env file (test/helpers/env-file.ts) that the
// child is pointed at via CEM_MCP_ENV_FILE — never the real .env, never process.env directly
// (EnvConfig reads neither). Passing '' for a var (rather than omitting it) is what simulates
// "configured but blank", regardless of whether a real .env with this var sits on disk.
async function callBitbucketOpenPr(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup } = await writeTempEnvFile(envOverrides);
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(REGISTER_FAKE_DRIVERS).href}`,
        CEM_MCP_ENV_FILE: envFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'bitbucket-open-pr'], { env });
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
          authProfile: 'cem',
          workspace: 'my-workspace',
          repoSlug: 'success-repo',
          title: 'Fix billing rounding',
          sourceBranch: 'fix/billing-rounding',
          destinationBranch: 'main',
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
  OPEN_PULL_REQUEST_BITBUCKET_EMAIL: EMAIL,
  OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN: API_TOKEN,
};

describe('bitbucket-open-pr (via call-tool.mjs against the real MCP server)', () => {
  it('opens a pull request, sending a Basic auth header built from the "cem" profile credentials', async () => {
    const { stdout, exitCode } = await callBitbucketOpenPr({}, ENV_WITH_CREDENTIALS);
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.id).toBe(42);
    expect(payload.title).toBe('Fix billing rounding');
    expect(payload.state).toBe('OPEN');
    expect(payload.sourceBranch).toBe('fix/billing-rounding');
    expect(payload.destinationBranch).toBe('main');
    expect(payload.url).toBe('https://bitbucket.org/my-workspace/success-repo/pull-requests/42');
  });

  it('rejects when the Bitbucket API returns a non-2xx response, surfacing its error message', async () => {
    const { stderr, exitCode } = await callBitbucketOpenPr(
      { repoSlug: 'error-repo' },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('source branch not found');
  });

  it('rejects when the "cem" authProfile email env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callBitbucketOpenPr(
      {},
      { ...ENV_WITH_CREDENTIALS, OPEN_PULL_REQUEST_BITBUCKET_EMAIL: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('OPEN_PULL_REQUEST_BITBUCKET_EMAIL');
    expect(stderr).toContain('authProfile "cem"');
  });

  it('rejects when the "cem" authProfile API token env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callBitbucketOpenPr(
      {},
      { ...ENV_WITH_CREDENTIALS, OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('OPEN_PULL_REQUEST_BITBUCKET_API_TOKEN');
    expect(stderr).toContain('authProfile "cem"');
  });

  it('rejects an unregistered authProfile', async () => {
    const { stderr, exitCode } = await callBitbucketOpenPr(
      { authProfile: 'not-a-real-profile' },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('authProfile');
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'bitbucket-open-pr');

    afterEach(async () => {
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns it as the summary plus the written path', async () => {
      const { stdout, exitCode } = await callBitbucketOpenPr(
        { outputFileName: 'e2e-result.json' },
        ENV_WITH_CREDENTIALS,
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.id).toBe(42);

      const written = JSON.parse(await readFile(summary.outputPath, 'utf8'));
      expect(written.id).toBe(42);
    });
  });
});
