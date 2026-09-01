import type { HttpRequest, JiraCredentials, SearchIssuesInput } from './types.js';

function buildAuthorizationHeader(credentials: JiraCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export function buildSearchIssuesRequest(
  input: SearchIssuesInput,
  credentials: JiraCredentials,
): HttpRequest {
  const url = `${credentials.siteUrl}/rest/api/3/search/jql`;

  const body: Record<string, unknown> = { jql: input.jql };
  if (input.fields !== undefined) body.fields = input.fields;
  if (input.maxResults !== undefined) body.maxResults = input.maxResults;
  if (input.nextPageToken !== undefined) body.nextPageToken = input.nextPageToken;

  return {
    method: 'POST',
    url,
    headers: {
      Authorization: buildAuthorizationHeader(credentials),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  };
}
