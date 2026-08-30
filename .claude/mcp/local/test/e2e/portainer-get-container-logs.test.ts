// Covers portainer-get-container-logs end to end through the real MCP server process — credential injection as
// X-API-Key, stackNamespace-aware container resolution against a fake endpoint that (like the
// real "hml" one) runs two stacks with the identical service set, and raw-byte Docker stream
// demuxing + ANSI stripping on the logs response. Same "spawn the real server, fake only the
// external driver" approach as test/e2e/safe-curl.test.ts.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';
import { writeTempJsonFile } from '../helpers/json-file.js';

// Mirrors the constants of the same name in test/fixtures/fake-undici.mjs — not imported from
// there directly (a .mjs fixture has no type declarations, and every other e2e suite in this
// project keeps its own local constants rather than importing across the src/test boundary).
const PORTAINER_FAKE_API_KEY = 'fake-portainer-token';
const PORTAINER_HML_HOST = 'portainer-hml.example.internal';
const PORTAINER_PRD_HOST = 'portainer.example.internal';
const PORTAINER_ENDPOINT_ID = 1;
const PORTAINER_HML_STACK_NAMESPACE = 'example-stack-hml';
const PORTAINER_PRD_STACK_NAMESPACE = 'example-stack-prd';

// Injected via POCHETE_PORTAINER_CONFIG_FILE into the spawned server process below — the same
// shape as the real, gitignored config.json (see config.example.json), but only ever this
// fixture's own generic host/stackNamespace/service names, matching fake-undici.mjs exactly.
const FAKE_CONFIG = {
  environments: {
    hml: {
      envVar: 'PORTAINER_HML_API_KEY',
      host: PORTAINER_HML_HOST,
      endpointId: PORTAINER_ENDPOINT_ID,
      headerName: 'X-API-Key',
      stackNamespace: PORTAINER_HML_STACK_NAMESPACE,
      // "svc-b" is registered here but has no matching container in fake-undici.mjs's hml fixture
      // on purpose — exercises the "registered but no container in this stack" error path,
      // distinct from "not registered at all".
      services: ['svc-a', 'svc-b'],
    },
    prd: {
      envVar: 'PORTAINER_PRD_API_KEY',
      host: PORTAINER_PRD_HOST,
      endpointId: PORTAINER_ENDPOINT_ID,
      headerName: 'X-API-Key',
      stackNamespace: PORTAINER_PRD_STACK_NAMESPACE,
      services: ['svc-a'],
    },
  },
};

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CALL_TOOL_MJS = path.join(SERVER_ROOT, 'bin', 'call-tool.mjs');
const REGISTER_FAKE_DRIVERS = path.join(
  SERVER_ROOT,
  'test',
  'fixtures',
  'register-fake-drivers.mjs',
);

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function callPortainerGetContainerLogs(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup: cleanupEnvFile } = await writeTempEnvFile(envOverrides);
  const { path: configFile, cleanup: cleanupConfigFile } = await writeTempJsonFile(
    'config.json',
    FAKE_CONFIG,
  );
  const cleanup = async () => {
    await cleanupEnvFile();
    await cleanupConfigFile();
  };
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(REGISTER_FAKE_DRIVERS).href}`,
        POCHETE_MCP_ENV_FILE: envFile,
        POCHETE_PORTAINER_CONFIG_FILE: configFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'portainer-get-container-logs'], { env });
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

      child.stdin.write(JSON.stringify({ environment: 'hml', ...toolArguments }));
      child.stdin.end();
    });
  } finally {
    await cleanup();
  }
}

describe('portainer-get-container-logs (via call-tool.mjs against the real MCP server)', () => {
  it('resolves the right stack container and returns clean, demuxed, ANSI-free logs', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerLogs(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.environment).toBe('hml');
    expect(payload.service).toBe('svc-a');
    expect(payload.containerId).toBe(
      'f59ef0407494b49caae6d2c9ca969cfa4d3db8cebe8f78a8db227cd956eba618',
    );
    expect(payload.logs).toBe('log line one\nlog line two\n');
  });

  it('defaults tail to 200 when not given', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerLogs(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).tail).toBe(200);
  });

  it('rejects an unregistered service name', async () => {
    const { exitCode } = await callPortainerGetContainerLogs(
      { service: 'not-a-real-service' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(1);
  });

  it('fetches from "prd" using its own env var and host, distinct from "hml"', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerLogs(
      { environment: 'prd', service: 'svc-a' },
      { PORTAINER_PRD_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.environment).toBe('prd');
    expect(payload.logs).toBe('prd log line one\n');
  });

  it('rejects when the "hml" env var is not set, naming it and the environment', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerLogs(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('PORTAINER_HML_API_KEY');
    expect(stderr).toContain('environment "hml"');
  });

  it('surfaces a clear error when the credential is wrong (Portainer returns 403)', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerLogs(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: 'wrong-token' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('403');
  });

  it('surfaces a clear error when the service has no container in this stack', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerLogs(
      { service: 'svc-b' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('svc-b');
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'portainer-get-container-logs');

    afterEach(async () => {
      const { rm } = await import('node:fs/promises');
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns a summary with logsLength instead of logs', async () => {
      const { stdout, exitCode } = await callPortainerGetContainerLogs(
        { service: 'svc-a', outputFileName: 'e2e-result.json' },
        { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.logs).toBeUndefined();
      expect(summary.logsLength).toBe('log line one\nlog line two\n'.length);
    });
  });
});
