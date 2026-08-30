import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { AUTH_PROFILE_KEYS, resolveCredentials } from './auth-profiles.js';
import { sendHttpRequest } from './http.js';
import { buildCreatePullRequestRequest } from './request.js';
import { parseCreatePullRequestResponse } from './response.js';

const INPUT_SHAPE = {
  authProfile: z
    .enum(AUTH_PROFILE_KEYS as [string, ...string[]])
    .describe(
      `Which registered credential profile to use (see auth-profiles.json). No default — ` +
        `always state it explicitly. Registered profiles: ${AUTH_PROFILE_KEYS.join(', ')}`,
    ),
  workspace: z
    .string()
    .min(1)
    .describe('Bitbucket workspace slug (the segment right after bitbucket.org/ in the repo URL).'),
  repoSlug: z
    .string()
    .min(1)
    .describe('Bitbucket repository slug (the segment right after the workspace in the repo URL).'),
  title: z.string().min(1).describe('Pull request title.'),
  sourceBranch: z.string().min(1).describe('Branch containing the changes to merge.'),
  destinationBranch: z
    .string()
    .min(1)
    .describe('Branch the pull request merges into. No default — always state it explicitly.'),
  description: z
    .string()
    .optional()
    .describe('Pull request description (Markdown). Omit for none.'),
  closeSourceBranch: z
    .boolean()
    .optional()
    .describe(
      'Whether Bitbucket closes the source branch after the pull request merges. Omit to leave ' +
        "Bitbucket's own default (false).",
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerBitbucketOpenPrTool(server: McpServer): void {
  server.registerTool(
    'bitbucket-open-pr',
    {
      title: 'Open a pull request on Bitbucket Cloud',
      description:
        'Calls the Bitbucket Cloud REST API (POST /2.0/repositories/{workspace}/{repoSlug}/' +
        'pullrequests) to open a pull request, authenticating with Basic auth (Atlassian account ' +
        'email + API token) resolved from the env var pair registered for the given authProfile ' +
        "(see auth-profiles.json) in this MCP server's own .env — the credentials never appear as " +
        'tool arguments or in chat. workspace and repoSlug are call arguments, so one authProfile ' +
        'can open pull requests against any repository the token has access to. destinationBranch ' +
        'has no default; it must always be stated explicitly.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const credentials = resolveCredentials(input.authProfile, new EnvConfig('bitbucket-open-pr'));
        const request = buildCreatePullRequestRequest(input, credentials);
        const response = await sendHttpRequest(request);
        const result = parseCreatePullRequestResponse(response);

        return await finalizeToolOutput({
          toolName: 'bitbucket-open-pr',
          payload: result,
          summary: { ...result },
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
