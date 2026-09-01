import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveCredentials } from './auth-profiles.js';
import { sendHttpRequest } from './http.js';
import { buildAddCommentRequest } from './request.js';
import { parseAddCommentResponse } from './response.js';

const INPUT_SHAPE = {
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered credential/site profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  issueKey: z.string().min(1).describe('Jira issue key or id (e.g. "ABC-123") to comment on.'),
  comment: z
    .string()
    .min(1)
    .describe(
      'Plain-text comment body. Converted server-side into the minimal Atlassian Document ' +
        'Format (ADF) Jira Cloud requires — one paragraph, with line breaks preserved as ADF ' +
        'hardBreak nodes. Markdown or ADF markup passed here is sent as literal text, not parsed.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerJiraAddCommentTool(server: McpServer): void {
  server.registerTool(
    'jira-add-comment',
    {
      title: 'Add a comment to a Jira issue',
      description:
        'Calls the Jira Cloud REST API (POST /rest/api/3/issue/{issueKey}/comment) to add a ' +
        'plain-text comment, authenticating with Basic auth (Atlassian account email + API ' +
        'token) resolved from the env var pair registered for the given authProfile (see ' +
        "auth-profiles.json) in this MCP server's own .env — the credentials never appear as " +
        'tool arguments or in chat. The site URL is also part of the authProfile, so one ' +
        'authProfile always targets the same Jira site.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const credentials = resolveCredentials(
          input.authProfile,
          new EnvConfig('jira-add-comment'),
        );
        const request = buildAddCommentRequest(input, credentials);
        const response = await sendHttpRequest(request);
        const result = parseAddCommentResponse(response);

        return await finalizeToolOutput({
          toolName: 'jira-add-comment',
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
