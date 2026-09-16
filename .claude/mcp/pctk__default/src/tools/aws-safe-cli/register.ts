import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveAwsCredentials } from './auth-profiles.js';
import { resolveCommandRule } from './command-allowlist.js';
import { runAwsCommand } from './exec.js';
import type { AwsExecResult } from './types.js';
import { assertNoScopeOverride, validateCommand } from './validate.js';

const DEFAULT_BINARY_PATH = 'aws';

const INPUT_SHAPE = {
  service: z
    .string()
    .min(1)
    .describe(
      'The AWS CLI service namespace (e.g. "s3", "ec2", "logs", "sts") — combined with ' +
        '`operation` as "<service> <operation>" to look up the rule in this server\'s own ' +
        'command-allowlist.json. Everything is denied until a human deliberately enables it there.',
    ),
  operation: z
    .string()
    .min(1)
    .describe(
      'The AWS CLI operation within `service` (e.g. "ls", "describe-instances", "tail", ' +
        '"get-caller-identity") — see `service` for how the two combine to look up the ' +
        'allowlist rule.',
    ),
  args: z
    .array(z.string())
    .default([])
    .describe(
      'Additional flags/arguments after service+operation, still subject to the rule ' +
        'registered for "<service> <operation>" in command-allowlist.json. Must never include ' +
        '--region/--profile/--endpoint-url — those are fixed by authProfile and rejected ' +
        'mechanically if present.',
    ),
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered AWS credential profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. Fixes the region and the access key/secret (and optional ' +
        'session token) this call authenticates with. An unregistered value returns an error ' +
        'listing the profiles actually registered.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerAwsCliTool(server: McpServer): void {
  server.registerTool(
    'aws-safe-cli',
    {
      title: 'Run an allowlisted AWS CLI command with credentials injected server-side',
      description:
        'Runs the real, locally installed aws CLI binary as a subprocess (no shell, argv built ' +
        "as an array) for a service+operation registered in this server's own " +
        'command-allowlist.json — every service+operation is denied until a human deliberately ' +
        'enables it there, with whatever rule (required/forbidden flags) that entry declares. ' +
        "The access key/secret (and optional session token) are injected into the child process's " +
        "own environment from the env vars registered for the call's authProfile (see " +
        'auth-profiles.json), never as a CLI argument, so they never appear in `ps`/' +
        '/proc/<pid>/cmdline; the child env is also stripped of AWS_PROFILE/' +
        'AWS_SHARED_CREDENTIALS_FILE/AWS_CONFIG_FILE and IMDS is disabled ' +
        '(AWS_EC2_METADATA_DISABLED), so the call can never fall back to a default credential ' +
        'already present on the host. --region/--profile/--endpoint-url are appended from that ' +
        'same authProfile and are rejected mechanically if the caller tries to pass them in ' +
        'args. A direct `aws` invocation outside this tool is blocked at the session level by a ' +
        'separate hook — this tool is the only sanctioned way to run an AWS CLI command here.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const rule = resolveCommandRule(input.service, input.operation);
        assertNoScopeOverride(input.args);
        validateCommand(input.service, input.operation, input.args, rule);

        const env = new EnvConfig('aws-safe-cli');
        const credentials = resolveAwsCredentials(input.authProfile, env);
        const binaryPath = env.getRaw('AWS_CLI_PATH') || DEFAULT_BINARY_PATH;
        const timeoutRaw = env.getRaw('AWS_CLI_TIMEOUT_MS');
        const timeoutMs =
          timeoutRaw && !Number.isNaN(Number(timeoutRaw)) ? Number(timeoutRaw) : undefined;

        const result: AwsExecResult = await runAwsCommand({
          binaryPath,
          service: input.service,
          operation: input.operation,
          args: input.args,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
          region: credentials.region,
          timeoutMs,
        });

        const summary = {
          service: result.service,
          operation: result.operation,
          args: result.args,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        };

        return await finalizeToolOutput({
          toolName: 'aws-safe-cli',
          payload: result,
          summary,
          outputFileName: input.outputFileName,
          outputDir: input.outputDir,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    },
  );
}
