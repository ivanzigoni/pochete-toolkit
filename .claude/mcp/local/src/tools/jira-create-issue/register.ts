import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveCredentials } from './auth-profiles.js';
import { sendHttpRequest } from './http.js';
import { buildCreateIssueRequest } from './request.js';
import { parseCreateIssueResponse } from './response.js';

const INPUT_SHAPE = {
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered credential/site profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  projectKey: z
    .string()
    .min(1)
    .describe('Jira project key the new issue belongs to (e.g. "DC"). No default.'),
  issueType: z
    .string()
    .min(1)
    .describe(
      'Issue type name as configured on the target project (e.g. "Tarefa", "Bug", "Story"). ' +
        'No default — an unknown name for this project returns an error from Jira.',
    ),
  summary: z.string().min(1).describe('Issue summary/title.'),
  description: z
    .string()
    .optional()
    .describe(
      'Plain-text issue description. Converted server-side into the minimal Atlassian Document ' +
        'Format (ADF) Jira Cloud requires — one paragraph, with line breaks preserved as ADF ' +
        'hardBreak nodes. Omit for no description.',
    ),
  labels: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional list of labels to apply to the new issue.'),
  ...OUTPUT_FILE_SHAPE,
};

export function registerJiraCreateIssueTool(server: McpServer): void {
  server.registerTool(
    'jira-create-issue',
    {
      title: 'Create a Jira issue',
      description:
        'Calls the Jira Cloud REST API (POST /rest/api/3/issue) to create a new issue, ' +
        'authenticating with Basic auth (Atlassian account email + API token) resolved from the ' +
        'env var pair registered for the given authProfile (see auth-profiles.json) in this MCP ' +
        "server's own .env — the credentials never appear as tool arguments or in chat. The " +
        'site URL is also part of the authProfile, so one authProfile always targets the same ' +
        'Jira site. projectKey and issueType are call arguments with no default — Jira rejects ' +
        'the request if either does not match the target project exactly.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const credentials = resolveCredentials(
          input.authProfile,
          new EnvConfig('jira-create-issue'),
        );
        const request = buildCreateIssueRequest(input, credentials);
        const response = await sendHttpRequest(request);
        const result = parseCreateIssueResponse(response);

        return await finalizeToolOutput({
          toolName: 'jira-create-issue',
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
