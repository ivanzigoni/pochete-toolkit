/**
 * Runs the real `railway` binary as a subprocess — argv built as an array and passed straight to
 * execFile, never through a shell or string concatenation, so nothing in `command`/`args` can be
 * interpreted as shell syntax. The token is injected into the child's own env (RAILWAY_TOKEN),
 * never appended to argv, so it never appears in `ps`/`/proc/<pid>/cmdline` for another local user
 * to read. project/environment/service are appended from the caller's resolved auth profile, not
 * from `args` — validate.ts's assertNoScopeOverride already rejects an attempt to set them from
 * args before this function ever runs.
 */
import { execFile, type ExecFileException } from 'node:child_process';

import type { RailwayExecResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export class RailwayExecError extends Error {}

export interface RunRailwayCommandParams {
  readonly binaryPath: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string | undefined;
  readonly token: string;
  readonly timeoutMs: number | undefined;
}

function buildArgv(params: RunRailwayCommandParams): string[] {
  const argv = [
    params.command,
    ...params.args,
    '--project',
    params.projectId,
    '--environment',
    params.environmentId,
  ];
  if (params.serviceId) argv.push('--service', params.serviceId);
  return argv;
}

function buildChildEnv(token: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.RAILWAY_API_TOKEN;
  env.RAILWAY_TOKEN = token;
  return env;
}

function describeSpawnFailure(
  binaryPath: string,
  command: string,
  error: ExecFileException,
): string {
  if (error.killed) {
    return `railway ${command} timed out and was killed`;
  }
  if (error.code === 'ENOENT') {
    return `railway CLI binary not found at "${binaryPath}" — install it, or set RAILWAY_CLI_PATH in this tool's .env`;
  }
  return `failed to run the railway CLI (${binaryPath}): ${error.message}`;
}

export function runRailwayCommand(params: RunRailwayCommandParams): Promise<RailwayExecResult> {
  const argv = buildArgv(params);
  const env = buildChildEnv(params.token);
  const timeout = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise<RailwayExecResult>((resolve, reject) => {
    execFile(
      params.binaryPath,
      argv,
      { env, timeout, maxBuffer: MAX_BUFFER_BYTES },
      (error: ExecFileException | null, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;

        if (error && typeof error.code !== 'number') {
          reject(
            new RailwayExecError(describeSpawnFailure(params.binaryPath, params.command, error)),
          );
          return;
        }

        resolve({
          command: params.command,
          args: params.args,
          exitCode: error ? (error.code as number) : 0,
          stdout,
          stderr,
          durationMs,
        });
      },
    );
  });
}
