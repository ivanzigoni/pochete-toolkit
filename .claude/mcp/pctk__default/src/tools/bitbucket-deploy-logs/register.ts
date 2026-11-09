import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveCredentials } from './auth-profiles.js';
import { fetchDeployLogs } from './deploy-logs.js';

const INPUT_SHAPE = {
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered credential profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  workspace: z
    .string()
    .min(1)
    .describe('Bitbucket workspace slug (the segment right after bitbucket.org/ in the repo URL).'),
  repoSlug: z
    .string()
    .min(1)
    .describe('Bitbucket repository slug (the segment right after the workspace in the repo URL).'),
  commitHash: z
    .string()
    .min(1)
    .describe(
      'Full commit SHA the pipeline was triggered for — typically the merge commit created on ' +
        'the destination branch when a pull request merges. A short/abbreviated hash is not ' +
        "guaranteed to match Bitbucket's own pipeline-lookup query.",
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerBitbucketDeployLogsTool(server: McpServer): void {
  server.registerTool(
    'bitbucket-deploy-logs',
    {
      title: 'Fetch a Bitbucket Pipelines run log for a given commit',
      description:
        'Locates the Bitbucket Pipelines run triggered for a given commit ' +
        '(GET /2.0/repositories/{workspace}/{repoSlug}/pipelines/, filtered by ' +
        'target.commit.hash), lists its steps, and fetches each step\'s log ' +
        '(GET .../pipelines/{pipeline_uuid}/steps/{step_uuid}/log), returning them concatenated ' +
        'in execution order. Authenticates with Basic auth (Atlassian account email + API ' +
        "token) resolved from the env var pair registered for the given authProfile (see " +
        "auth-profiles.json) in this MCP server's own .env — the credentials never appear as " +
        'tool arguments or in chat. workspace and repoSlug are call arguments, so one ' +
        'authProfile can fetch logs from any repository the token has access to.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const credentials = resolveCredentials(
          input.authProfile,
          new EnvConfig('bitbucket-deploy-logs'),
        );
        const result = await fetchDeployLogs(input, credentials);

        return await finalizeToolOutput({
          toolName: 'bitbucket-deploy-logs',
          payload: result,
          summary: {
            commitHash: result.commitHash,
            pipelineUuid: result.pipelineUuid,
            buildNumber: result.buildNumber,
            pipelineState: result.pipelineState,
            stepCount: result.steps.length,
            logsLength: result.logs.length,
          },
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
