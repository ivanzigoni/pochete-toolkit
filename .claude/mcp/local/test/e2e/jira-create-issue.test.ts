// Covers jira-create-issue end to end through the real MCP server process — Basic-auth header
// construction, the description-to-ADF conversion reaching the outgoing request body, the
// missing-env-var error path, the unregistered-authProfile error path, and the Jira
// field-validation error path — same approach as test/e2e/jira-get-issue.test.ts, with `undici`
// faked via test/fixtures/fake-undici.mjs (JIRA_FAKE_SITE).
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';
import { writeTempJsonFile } from '../helpers/json-file.js';

// Mirrors the constant of the same name in test/fixtures/fake-undici.mjs — not imported from
// there directly (a .mjs fixture has no type declarations, and every other e2e suite in this
// project keeps its own local constants rather than importing across the src/test boundary).
const JIRA_FAKE_SITE = 'https://fake-jira.example.test';

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

const FAKE_AUTH_PROFILES = {
  'example-profile': {
    siteUrl: JIRA_FAKE_SITE,
    emailEnvVar: 'JIRA_CREATE_ISSUE_EXAMPLE_PROFILE_EMAIL',
    apiTokenEnvVar: 'JIRA_CREATE_ISSUE_EXAMPLE_PROFILE_API_TOKEN',
  },
};

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function callJiraCreateIssue(
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
        POCHETE_JIRA_CREATE_ISSUE_AUTH_PROFILES_FILE: authProfilesFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'jira-create-issue'], { env });
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
          projectKey: 'ABC',
          issueType: 'Tarefa',
          summary: 'Test issue',
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
  JIRA_CREATE_ISSUE_EXAMPLE_PROFILE_EMAIL: EMAIL,
  JIRA_CREATE_ISSUE_EXAMPLE_PROFILE_API_TOKEN: API_TOKEN,
};

describe('jira-create-issue (via call-tool.mjs against the real MCP server)', () => {
  it('creates an issue, sending project/issuetype/summary and a description converted to ADF', async () => {
    const { stdout, exitCode } = await callJiraCreateIssue(
      { description: 'line one\nline two' },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.id).toBe('10050');
    expect(payload.key).toBe('ABC-999');
  });

  it('rejects when the Jira API returns a non-2xx response, surfacing its field-level error message', async () => {
    const { stderr, exitCode } = await callJiraCreateIssue(
      { projectKey: 'BAD' },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('issuetype: valid issue type is required');
  });

  it('rejects when the "example-profile" authProfile API token env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callJiraCreateIssue(
      {},
      { ...ENV_WITH_CREDENTIALS, JIRA_CREATE_ISSUE_EXAMPLE_PROFILE_API_TOKEN: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('JIRA_CREATE_ISSUE_EXAMPLE_PROFILE_API_TOKEN');
    expect(stderr).toContain('authProfile "example-profile"');
  });

  it('rejects an unregistered authProfile', async () => {
    const { stderr, exitCode } = await callJiraCreateIssue(
      { authProfile: 'not-a-real-profile' },
      ENV_WITH_CREDENTIALS,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('authProfile');
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'jira-create-issue');

    afterEach(async () => {
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns it as the summary plus the written path', async () => {
      const { stdout, exitCode } = await callJiraCreateIssue(
        { outputFileName: 'e2e-result.json' },
        ENV_WITH_CREDENTIALS,
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.key).toBe('ABC-999');

      const written = JSON.parse(await readFile(summary.outputPath, 'utf8'));
      expect(written.key).toBe('ABC-999');
    });
  });
});
