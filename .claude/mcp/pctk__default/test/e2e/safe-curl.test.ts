// Covers safe-curl end to end through the real MCP server process — cookie injection from the
// authProfile's registered env var (SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE for the "example-profile" profile), the
// missing-env-var error path, and mechanical rejection of a curl that sets its own
// Cookie/Authorization header — the same "spawn the real server, fake only the external driver"
// approach as test/e2e/safe-query.test.ts, with `undici` faked instead of a DB driver (see
// test/fixtures/fake-undici.mjs).
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';
import { writeTempJsonFile } from '../helpers/json-file.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CALL_TOOL_MJS = path.join(SERVER_ROOT, 'bin', 'call-tool.mjs');
const REGISTER_FAKE_DRIVERS = path.join(
  SERVER_ROOT,
  'test',
  'fixtures',
  'register-fake-drivers.mjs',
);

const AUTH_COOKIE = 'cognitoRefreshToken=fake-token; Authorization=fake-jwt';
const ECHO_URL = 'https://example.test/echo';
const SET_COOKIE_URL = 'https://example.test/set-cookie';

// Injected via POCHETE_SAFE_CURL_AUTH_PROFILES_FILE into the spawned server process below — the
// same shape as the real, gitignored auth-profiles.json (see auth-profiles.example.json).
const FAKE_AUTH_PROFILES = {
  'example-profile': { envVar: 'SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE' },
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
async function callSafeCurl(
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
        POCHETE_SAFE_CURL_AUTH_PROFILES_FILE: authProfilesFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'safe-curl'], { env });
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

      child.stdin.write(JSON.stringify({ authProfile: 'example-profile', ...toolArguments }));
      child.stdin.end();
    });
  } finally {
    await cleanup();
  }
}

describe('safe-curl (via call-tool.mjs against the real MCP server)', () => {
  it('injects the "example-profile" authProfile cookie as the Cookie header on a GET', async () => {
    const { stdout, exitCode } = await callSafeCurl(
      { curl: `curl '${ECHO_URL}'` },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.status).toBe(200);
    const body = JSON.parse(payload.body);
    expect(body.cookie).toBe(AUTH_COOKIE);
    expect(body.method).toBe('GET');
  });

  it('injects the cookie on a POST carrying a --data-raw body', async () => {
    const { stdout, exitCode } = await callSafeCurl(
      {
        curl: `curl '${ECHO_URL}' -H 'content-type: application/json' --data-raw '{"a":1}'`,
      },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    const body = JSON.parse(payload.body);
    expect(body.method).toBe('POST');
    expect(body.cookie).toBe(AUTH_COOKIE);
    expect(body.body).toBe('{"a":1}');
  });

  it('rejects a curl that sets its own Cookie header, naming it', async () => {
    const { stderr, exitCode } = await callSafeCurl(
      { curl: `curl '${ECHO_URL}' -b 'sessionid=abc'` },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Cookie');
    expect(stderr).toContain("authProfile's env var");
  });

  it('rejects a curl that sets its own Authorization header, naming it', async () => {
    const { stderr, exitCode } = await callSafeCurl(
      { curl: `curl '${ECHO_URL}' -H 'Authorization: Bearer xyz'` },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Authorization');
  });

  it('rejects when the "example-profile" authProfile env var is not set, naming it and the profile', async () => {
    const { stderr, exitCode } = await callSafeCurl(
      { curl: `curl '${ECHO_URL}'` },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE');
    expect(stderr).toContain('authProfile "example-profile"');
    expect(stderr).toContain('is not set');
  });

  it('rejects an unregistered authProfile', async () => {
    const { stderr, exitCode } = await callSafeCurl(
      { curl: `curl '${ECHO_URL}'`, authProfile: 'not-a-real-profile' },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('authProfile');
  });

  it('rejects a malformed curl (unsupported flag) without ever making a request', async () => {
    const { stderr, exitCode } = await callSafeCurl(
      { curl: `curl '${ECHO_URL}' --made-up-flag` },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--made-up-flag');
  });

  it('redacts a set-cookie response header instead of returning it verbatim', async () => {
    const { stdout, exitCode } = await callSafeCurl(
      { curl: `curl '${SET_COOKIE_URL}'` },
      { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.headers['set-cookie']).toBe('[REDACTED]');
    expect(JSON.stringify(payload)).not.toContain('real-secret-value');
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'safe-curl');

    afterEach(async () => {
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk, redacted, and returns a summary with bodyLength instead of body', async () => {
      const { stdout, exitCode } = await callSafeCurl(
        { curl: `curl '${SET_COOKIE_URL}'`, outputFileName: 'e2e-result.json' },
        { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.status).toBe(200);
      expect(summary.body).toBeUndefined();
      expect(summary.bodyLength).toBe(JSON.stringify({ ok: true }).length);
      expect(summary.headers['set-cookie']).toBe('[REDACTED]');

      const written = JSON.parse(await readFile(summary.outputPath, 'utf8'));
      expect(written.body).toBe(JSON.stringify({ ok: true }));
      expect(written.headers['set-cookie']).toBe('[REDACTED]');
    });

    it('rejects an outputFileName containing a path separator', async () => {
      const { stderr, exitCode } = await callSafeCurl(
        { curl: `curl '${ECHO_URL}'`, outputFileName: '../escape.json' },
        { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: AUTH_COOKIE },
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('outputFileName');
    });
  });

  it('two concurrent calls each get an independent result', async () => {
    const [a, b] = await Promise.all([
      callSafeCurl({ curl: `curl '${ECHO_URL}'` }, { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: 'cookie-a' }),
      callSafeCurl({ curl: `curl '${ECHO_URL}'` }, { SAFE_CURL_EXAMPLE_PROFILE_AUTH_COOKIE: 'cookie-b' }),
    ]);
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(JSON.parse(JSON.parse(a.stdout).body).cookie).toBe('cookie-a');
    expect(JSON.parse(JSON.parse(b.stdout).body).cookie).toBe('cookie-b');
  });
});
