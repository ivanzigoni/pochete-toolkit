import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { writeTempEnvFile } from '../helpers/env-file.js';
import { writeTempJsonFile } from '../helpers/json-file.js';

const PORTAINER_FAKE_API_KEY = 'fake-portainer-token';
const PORTAINER_HML_HOST = 'portainer-hml.example.internal';
const PORTAINER_PRD_HOST = 'portainer.example.internal';
const PORTAINER_ENDPOINT_ID = 1;
const PORTAINER_HML_STACK_NAMESPACE = 'example-stack-hml';
const PORTAINER_PRD_STACK_NAMESPACE = 'example-stack-prd';
const HML_CONTAINER_ID = 'f59ef0407494b49caae6d2c9ca969cfa4d3db8cebe8f78a8db227cd956eba618';
const PRD_CONTAINER_ID = 'a11cebe8f78a8db227cd956eba618f59ef0407494b49caae6d2c9ca969cfa4d';
const PRD_EXITED_CONTAINER_ID = 'e7175edc0ffee0ddba11e7175edc0ffee0ddba11e7175edc0ffee0ddba11e717';

const FAKE_CONFIG = {
  environments: {
    hml: {
      envVar: 'PORTAINER_HML_API_KEY',
      host: PORTAINER_HML_HOST,
      endpointId: PORTAINER_ENDPOINT_ID,
      headerName: 'X-API-Key',
      stackNamespace: PORTAINER_HML_STACK_NAMESPACE,
      services: ['svc-a', 'svc-b'],
    },
    prd: {
      envVar: 'PORTAINER_PRD_API_KEY',
      host: PORTAINER_PRD_HOST,
      endpointId: PORTAINER_ENDPOINT_ID,
      headerName: 'X-API-Key',
      stackNamespace: PORTAINER_PRD_STACK_NAMESPACE,
      services: ['svc-a', 'svc-tasks-denied'],
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

async function callPortainerGetContainerStats(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup: cleanupEnvFile } = await writeTempEnvFile(envOverrides);
  const { path: configFile, cleanup: cleanupConfigFile } = await writeTempJsonFile(
    'config.json',
    FAKE_CONFIG,
  );
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(REGISTER_FAKE_DRIVERS).href}`,
        POCHETE_MCP_ENV_FILE: envFile,
        POCHETE_PORTAINER_STATS_CONFIG_FILE: configFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'portainer-get-container-stats'], {
        env,
      });
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
    await cleanupEnvFile();
    await cleanupConfigFile();
  }
}

describe('portainer-get-container-stats (via call-tool.mjs against the real MCP server)', () => {
  it('resolves the right stack container on "hml" and returns cgroup v2 metrics, state and tasks', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerStats(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.environment).toBe('hml');
    expect(payload.service).toBe('svc-a');
    expect(payload.containerId).toBe(HML_CONTAINER_ID);
    expect(payload.containerState).toBe('running');
    expect(payload.sampledAt).toBe('2026-11-26T10:00:00.000000000Z');
    expect(payload.cpu.percent).toBeCloseTo(40);
    expect(payload.cpu).toMatchObject({
      onlineCpus: 4,
      limitCpus: 1,
      throttledPeriods: 12,
      throttledTimeNs: 345000,
    });
    expect(payload.memory).toEqual({
      usageBytes: 500,
      rawUsageBytes: 600,
      limitBytes: 1000,
      percent: 50,
      maxUsageBytes: null,
    });
    expect(payload.network).toEqual({
      rxBytes: 10,
      txBytes: 20,
      rxErrors: 0,
      txErrors: 0,
      rxDropped: 0,
      txDropped: 0,
    });
    expect(payload.blockIo).toEqual({ readBytes: 100, writeBytes: 50 });
    expect(payload.pids).toEqual({ current: 42, limit: 512 });
    expect(payload.state).toMatchObject({
      status: 'running',
      oomKilled: false,
      exitCode: 0,
      health: { status: 'healthy', failingStreak: 0 },
    });
    expect(payload.image).toBe('example/svc-a:hml');
    expect(payload.warnings).toEqual([]);
    expect(payload.recentTasks.map((task: { id: string }) => task.id)).toEqual([
      'hml-task-current',
    ]);
  });

  it('reads "prd" with its own env var and host and handles cgroup v1 memory', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerStats(
      { environment: 'prd', service: 'svc-a' },
      { PORTAINER_PRD_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.containerId).toBe(PRD_CONTAINER_ID);
    expect(payload.cpu.percent).toBeCloseTo(20);
    expect(payload.cpu.limitCpus).toBeNull();
    expect(payload.memory).toEqual({
      usageBytes: 500,
      rawUsageBytes: 800,
      limitBytes: 2000,
      percent: 25,
      maxUsageBytes: 900,
    });
    expect(payload.network).toBeNull();
    expect(payload.blockIo).toEqual({ readBytes: 7, writeBytes: 3 });
    expect(payload.recentTasks.map((task: { id: string }) => task.id)).toEqual([
      'prd-task-current',
      'prd-task-crashed',
    ]);
  });

  it('truncates recentTasks to tasksLimit', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerStats(
      { environment: 'prd', service: 'svc-a', tasksLimit: 1 },
      { PORTAINER_PRD_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).recentTasks).toHaveLength(1);
  });

  it('with includeStopped, resolves the OOM-killed container and returns null metrics', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerStats(
      { environment: 'prd', service: 'svc-a', includeStopped: true },
      { PORTAINER_PRD_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.containerId).toBe(PRD_EXITED_CONTAINER_ID);
    expect(payload.containerState).toBe('exited');
    expect(payload.cpu).toBeNull();
    expect(payload.memory).toBeNull();
    expect(payload.network).toBeNull();
    expect(payload.blockIo).toBeNull();
    expect(payload.pids).toBeNull();
    expect(payload.state).toMatchObject({ status: 'exited', oomKilled: true, exitCode: 137 });
    const crashed = payload.recentTasks.find(
      (task: { id: string }) => task.id === 'prd-task-crashed',
    );
    expect(crashed).toMatchObject({
      state: 'failed',
      error: 'task: non-zero exit (137)',
      exitCode: 137,
    });
  });

  it('degrades to recentTasks: null with a warning when the task history is denied', async () => {
    const { stdout, exitCode } = await callPortainerGetContainerStats(
      { environment: 'prd', service: 'svc-tasks-denied' },
      { PORTAINER_PRD_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.recentTasks).toBeNull();
    expect(payload.warnings).toHaveLength(1);
    expect(payload.warnings[0]).toContain('403');
    expect(payload.memory.usageBytes).toBe(10);
  });

  it('rejects an unregistered service name', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerStats(
      { service: 'not-a-real-service' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not-a-real-service');
  });

  it('rejects when the env var is not set, naming it and the environment', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerStats(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: '' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('PORTAINER_HML_API_KEY');
    expect(stderr).toContain('environment "hml"');
  });

  it('surfaces a clear error, without echoing the credential, when Portainer returns 403', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerStats(
      { service: 'svc-a' },
      { PORTAINER_HML_API_KEY: 'wrong-token' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('403');
    expect(stderr).not.toContain('wrong-token');
  });

  it('surfaces a clear error when the service has no container in this stack', async () => {
    const { stderr, exitCode } = await callPortainerGetContainerStats(
      { service: 'svc-b' },
      { PORTAINER_HML_API_KEY: PORTAINER_FAKE_API_KEY },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('svc-b');
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'portainer-get-container-stats');

    afterEach(async () => {
      const { rm } = await import('node:fs/promises');
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns a summary with task counts instead of tasks', async () => {
      const { stdout, exitCode } = await callPortainerGetContainerStats(
        { environment: 'prd', service: 'svc-a', outputFileName: 'e2e-result.json' },
        { PORTAINER_PRD_API_KEY: PORTAINER_FAKE_API_KEY },
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.recentTasks).toBeUndefined();
      expect(summary.recentTasksCount).toBe(2);
      expect(summary.failedTasksCount).toBe(1);
    });
  });
});
