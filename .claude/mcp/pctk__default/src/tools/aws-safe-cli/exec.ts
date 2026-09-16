/**
 * Runs the real `aws` binary as a subprocess — argv built as an array and passed straight to
 * execFile, never through a shell or string concatenation, so nothing in `service`/`operation`/
 * `args` can be interpreted as shell syntax. Credentials are injected into the child's own env
 * (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN), never appended to argv, so they
 * never appear in `ps`/`/proc/<pid>/cmdline` for another local user to read. region is appended
 * both as a CLI arg and as an env var from the caller's resolved auth profile, not from `args` —
 * validate.ts's assertNoScopeOverride already rejects an attempt to set --region/--profile/
 * --endpoint-url from args before this function ever runs.
 *
 * The child env is also stripped of every other AWS credential-resolution source the aws CLI
 * would otherwise fall back to (AWS_PROFILE, AWS_DEFAULT_PROFILE, AWS_SHARED_CREDENTIALS_FILE,
 * AWS_CONFIG_FILE, an inherited AWS_SESSION_TOKEN) and IMDS is disabled
 * (AWS_EC2_METADATA_DISABLED) — the aws CLI has a much wider default credential-resolution chain
 * than the railway CLI (env vars, ~/.aws/credentials, ~/.aws/config, instance/container role via
 * IMDS), so this call must be forced to use *only* the credential this profile injects, never a
 * default already present on the host running this MCP server.
 */
import { execFile, type ExecFileException } from 'node:child_process';

import type { AwsExecResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export class AwsExecError extends Error {}

export interface RunAwsCommandParams {
  readonly binaryPath: string;
  readonly service: string;
  readonly operation: string;
  readonly args: readonly string[];
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string | undefined;
  readonly region: string;
  readonly timeoutMs: number | undefined;
}

function buildArgv(params: RunAwsCommandParams): string[] {
  return [params.service, params.operation, ...params.args, '--region', params.region];
}

function buildChildEnv(params: RunAwsCommandParams): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.AWS_PROFILE;
  delete env.AWS_DEFAULT_PROFILE;
  delete env.AWS_SHARED_CREDENTIALS_FILE;
  delete env.AWS_CONFIG_FILE;
  delete env.AWS_SESSION_TOKEN;
  env.AWS_ACCESS_KEY_ID = params.accessKeyId;
  env.AWS_SECRET_ACCESS_KEY = params.secretAccessKey;
  if (params.sessionToken) env.AWS_SESSION_TOKEN = params.sessionToken;
  env.AWS_REGION = params.region;
  env.AWS_DEFAULT_REGION = params.region;
  env.AWS_EC2_METADATA_DISABLED = 'true';
  return env;
}

function describeSpawnFailure(
  binaryPath: string,
  service: string,
  operation: string,
  error: ExecFileException,
): string {
  if (error.killed) {
    return `aws ${service} ${operation} timed out and was killed`;
  }
  if (error.code === 'ENOENT') {
    return `aws CLI binary not found at "${binaryPath}" — install it, or set AWS_CLI_PATH in this tool's .env`;
  }
  return `failed to run the aws CLI (${binaryPath}): ${error.message}`;
}

export function runAwsCommand(params: RunAwsCommandParams): Promise<AwsExecResult> {
  const argv = buildArgv(params);
  const env = buildChildEnv(params);
  const timeout = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise<AwsExecResult>((resolve, reject) => {
    execFile(
      params.binaryPath,
      argv,
      { env, timeout, maxBuffer: MAX_BUFFER_BYTES },
      (error: ExecFileException | null, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;

        if (error && typeof error.code !== 'number') {
          reject(
            new AwsExecError(
              describeSpawnFailure(params.binaryPath, params.service, params.operation, error),
            ),
          );
          return;
        }

        resolve({
          service: params.service,
          operation: params.operation,
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
