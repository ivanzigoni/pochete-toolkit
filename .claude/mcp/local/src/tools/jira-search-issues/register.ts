import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveCredentials } from './auth-profiles.js';
import { sendHttpRequest } from './http.js';
import { buildSearchIssuesRequest } from './request.js';
import { parseSearchIssuesResponse } from './response.js';

const INPUT_SHAPE = {
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered credential/site profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  jql: z
    .string()
    .min(1)
    .describe(
      'JQL query string (e.g. \'project = ABC AND status = "In Progress"\'). No default — ' +
        'always state it explicitly.',
    ),
  fields: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Optional list of Jira field names/ids to return per issue (e.g. ["summary", "status"]). ' +
        "Omit to get Jira's own default field set, which can be large across many issues.",
    ),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of issues to return in this page. Omit to use Jira's own default."),
  nextPageToken: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Pagination token from a previous call's response (see isLast/nextPageToken in the " +
        'result) — pass it to fetch the next page of the same query. Omit for the first page.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerJiraSearchIssuesTool(server: McpServer): void {
  server.registerTool(
    'jira-search-issues',
    {
      title: 'Search Jira issues by JQL',
      description:
        'Calls the Jira Cloud REST API (POST /rest/api/3/search/jql — the current search ' +
        'endpoint; the older /rest/api/3/search was retired) to find issues matching a JQL ' +
        'query, authenticating with Basic auth (Atlassian account email + API token) resolved ' +
        'from the env var pair registered for the given authProfile (see auth-profiles.json) in ' +
        "this MCP server's own .env — the credentials never appear as tool arguments or in " +
        'chat. The site URL is also part of the authProfile, so one authProfile always targets ' +
        'the same Jira site. The response has no total count, only isLast/nextPageToken — page ' +
        'through with nextPageToken until isLast is true.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const credentials = resolveCredentials(
          input.authProfile,
          new EnvConfig('jira-search-issues'),
        );
        const request = buildSearchIssuesRequest(input, credentials);
        const response = await sendHttpRequest(request);
        const result = parseSearchIssuesResponse(response);

        return await finalizeToolOutput({
          toolName: 'jira-search-issues',
          payload: result,
          summary: {
            issueCount: result.issues.length,
            isLast: result.isLast,
            nextPageToken: result.nextPageToken,
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
