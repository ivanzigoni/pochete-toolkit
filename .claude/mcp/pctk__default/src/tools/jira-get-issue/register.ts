import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveCredentials } from './auth-profiles.js';
import { sendHttpRequest } from './http.js';
import { buildGetIssueRequest } from './request.js';
import { parseGetIssueResponse } from './response.js';

const INPUT_SHAPE = {
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered credential/site profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  issueKey: z.string().min(1).describe('Jira issue key or id (e.g. "ABC-123").'),
  fields: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Optional list of Jira field names/ids to return (e.g. ["summary", "status", ' +
        '"assignee"]). Omit to get Jira\'s own default field set for a GET issue call, which ' +
        'includes every field the account can see and can be large.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerJiraGetIssueTool(server: McpServer): void {
  server.registerTool(
    'jira-get-issue',
    {
      title: 'Read a Jira issue',
      description:
        'Calls the Jira Cloud REST API (GET /rest/api/3/issue/{issueKey}) to read one issue, ' +
        'authenticating with Basic auth (Atlassian account email + API token) resolved from the ' +
        'env var pair registered for the given authProfile (see auth-profiles.json) in this MCP ' +
        "server's own .env — the credentials never appear as tool arguments or in chat. The " +
        'site URL is also part of the authProfile, so one authProfile always targets the same ' +
        'Jira site. Returns the raw `fields` object exactly as Jira sends it (including ' +
        'Atlassian Document Format for description/comment-shaped fields) — this tool does not ' +
        'reshape or flatten it.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const credentials = resolveCredentials(input.authProfile, new EnvConfig('jira-get-issue'));
        const request = buildGetIssueRequest(input, credentials);
        const response = await sendHttpRequest(request);
        const result = parseGetIssueResponse(response);

        return await finalizeToolOutput({
          toolName: 'jira-get-issue',
          payload: result,
          summary: { key: result.key, id: result.id, self: result.self },
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
