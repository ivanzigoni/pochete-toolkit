import type { BitbucketCredentials, HttpRequest, OpenPullRequestInput } from './types.js';

const API_ROOT = 'https://api.bitbucket.org/2.0/repositories';

// Basic auth: Atlassian account email + API token — the only supported method since Bitbucket
// Cloud App Passwords were retired for creation on 2025-09-09 and fully disabled on 2026-06-09.
function buildAuthorizationHeader(credentials: BitbucketCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export function buildCreatePullRequestRequest(
  input: OpenPullRequestInput,
  credentials: BitbucketCredentials,
): HttpRequest {
  const url =
    `${API_ROOT}/${encodeURIComponent(input.workspace)}` +
    `/${encodeURIComponent(input.repoSlug)}/pullrequests`;

  const body: Record<string, unknown> = {
    title: input.title,
    source: { branch: { name: input.sourceBranch } },
    destination: { branch: { name: input.destinationBranch } },
  };
  if (input.description !== undefined) {
    body.description = input.description;
  }
  if (input.closeSourceBranch !== undefined) {
    body.close_source_branch = input.closeSourceBranch;
  }

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
