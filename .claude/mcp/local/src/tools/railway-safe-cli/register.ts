import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveAuthProfile, resolveAuthToken } from './auth-profiles.js';
import { resolveCommandRule } from './command-allowlist.js';
import { runRailwayCommand } from './exec.js';
import type { RailwayExecResult } from './types.js';
import { assertNoScopeOverride, validateCommand } from './validate.js';

const DEFAULT_BINARY_PATH = 'railway';

const INPUT_SHAPE = {
  command: z
    .string()
    .min(1)
    .describe(
      'The railway subcommand to run (e.g. "status", "list", "logs") — must be registered in ' +
        "this server's own command-allowlist.json, or the call is rejected before the railway " +
        'CLI is ever invoked. Everything is denied until a human deliberately enables it there.',
    ),
  args: z
    .array(z.string())
    .default([])
    .describe(
      'Additional flags/arguments after the subcommand, still subject to the rule registered ' +
        'for it in command-allowlist.json. Must never include --project/-p/--environment/-e/' +
        '--service/-s — those are fixed by authProfile and rejected mechanically if present.',
    ),
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered Railway project profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. Fixes the project, environment, optional service, and the ' +
        'token this call authenticates with. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerRailwayCliTool(server: McpServer): void {
  server.registerTool(
    'railway-safe-cli',
    {
      title: 'Run an allowlisted Railway CLI command with the token injected server-side',
      description:
        'Runs the real, locally installed railway CLI binary as a subprocess (no shell, argv ' +
        "built as an array) for a subcommand registered in this server's own " +
        'command-allowlist.json — every subcommand is denied until a human deliberately enables ' +
        'it there, with whatever rule (required/forbidden flags) that entry declares. The ' +
        "project token is injected into the child process's own environment as RAILWAY_TOKEN " +
        "from the env var registered for the call's authProfile (see auth-profiles.json), never " +
        'as a CLI argument, so it never appears in `ps`/`/proc/<pid>/cmdline`; --project/' +
        '--environment/--service are appended from that same authProfile and are rejected ' +
        'mechanically if the caller tries to pass them in args. A direct `railway` invocation ' +
        'outside this tool is blocked at the session level by a separate hook — this tool is the ' +
        'only sanctioned way to run a Railway CLI command here.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const rule = resolveCommandRule(input.command);
        assertNoScopeOverride(input.args);
        validateCommand(input.command, input.args, rule);

        const profile = resolveAuthProfile(input.authProfile);
        const env = new EnvConfig('railway-safe-cli');
        const token = resolveAuthToken(input.authProfile, env);
        const binaryPath = env.getRaw('RAILWAY_CLI_PATH') || DEFAULT_BINARY_PATH;
        const timeoutRaw = env.getRaw('RAILWAY_CLI_TIMEOUT_MS');
        const timeoutMs =
          timeoutRaw && !Number.isNaN(Number(timeoutRaw)) ? Number(timeoutRaw) : undefined;

        const result: RailwayExecResult = await runRailwayCommand({
          binaryPath,
          command: input.command,
          args: input.args,
          projectId: profile.projectId,
          environmentId: profile.environmentId,
          serviceId: profile.serviceId,
          token,
          timeoutMs,
        });

        const summary = {
          command: result.command,
          args: result.args,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        };

        return await finalizeToolOutput({
          toolName: 'railway-safe-cli',
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
