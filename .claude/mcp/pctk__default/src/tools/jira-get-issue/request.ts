import type { GetIssueInput, HttpRequest, JiraCredentials } from './types.js';

function buildAuthorizationHeader(credentials: JiraCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export function buildGetIssueRequest(
  input: GetIssueInput,
  credentials: JiraCredentials,
): HttpRequest {
  const url = new URL(
    `${credentials.siteUrl}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}`,
  );
  if (input.fields && input.fields.length > 0) {
    url.searchParams.set('fields', input.fields.join(','));
  }

  return {
    method: 'GET',
    url: url.toString(),
    headers: {
      Authorization: buildAuthorizationHeader(credentials),
      Accept: 'application/json',
    },
    body: undefined,
  };
}
