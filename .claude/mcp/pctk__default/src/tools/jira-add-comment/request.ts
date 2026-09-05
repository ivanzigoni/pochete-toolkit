import { toAdfDocument } from './adf.js';
import type { AddCommentInput, HttpRequest, JiraCredentials } from './types.js';

function buildAuthorizationHeader(credentials: JiraCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export function buildAddCommentRequest(
  input: AddCommentInput,
  credentials: JiraCredentials,
): HttpRequest {
  const url = `${credentials.siteUrl}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/comment`;

  return {
    method: 'POST',
    url,
    headers: {
      Authorization: buildAuthorizationHeader(credentials),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ body: toAdfDocument(input.comment) }),
  };
}
