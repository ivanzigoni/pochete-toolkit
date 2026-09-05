import { toAdfDocument } from './adf.js';
import type { CreateIssueInput, HttpRequest, JiraCredentials } from './types.js';

function buildAuthorizationHeader(credentials: JiraCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export function buildCreateIssueRequest(
  input: CreateIssueInput,
  credentials: JiraCredentials,
): HttpRequest {
  const url = `${credentials.siteUrl}/rest/api/3/issue`;

  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { name: input.issueType },
    summary: input.summary,
  };
  if (input.description !== undefined) {
    fields.description = toAdfDocument(input.description);
  }
  if (input.labels !== undefined) {
    fields.labels = input.labels;
  }

  return {
    method: 'POST',
    url,
    headers: {
      Authorization: buildAuthorizationHeader(credentials),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ fields }),
  };
}
