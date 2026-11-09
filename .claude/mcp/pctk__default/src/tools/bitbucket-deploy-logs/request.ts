import type { BitbucketCredentials, DeployLogsInput, HttpRequest } from './types.js';

const API_ROOT = 'https://api.bitbucket.org/2.0/repositories';

// Basic auth: Atlassian account email + API token — the only supported method since Bitbucket
// Cloud App Passwords were retired for creation on 2025-09-09 and fully disabled on 2026-06-09.
function buildAuthorizationHeader(credentials: BitbucketCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

function buildHeaders(credentials: BitbucketCredentials): Record<string, string> {
  return {
    Authorization: buildAuthorizationHeader(credentials),
    Accept: 'application/json',
  };
}

function repoRoot(input: DeployLogsInput): string {
  return `${API_ROOT}/${encodeURIComponent(input.workspace)}/${encodeURIComponent(input.repoSlug)}`;
}

// BBQL (Bitbucket Query Language): `target.commit.hash="<sha>"`. Built via URLSearchParams so the
// quotes around the hash are percent-encoded correctly, rather than hand-rolling encodeURIComponent
// over a manually quoted string.
export function buildListPipelinesRequest(
  input: DeployLogsInput,
  credentials: BitbucketCredentials,
): HttpRequest {
  const params = new URLSearchParams({
    q: `target.commit.hash="${input.commitHash}"`,
    sort: '-created_on',
    pagelen: '5',
  });

  return {
    method: 'GET',
    url: `${repoRoot(input)}/pipelines/?${params.toString()}`,
    headers: buildHeaders(credentials),
    body: undefined,
  };
}

export function buildListStepsRequest(
  input: DeployLogsInput,
  credentials: BitbucketCredentials,
  pipelineUuid: string,
  nextPageUrl: string | undefined,
): HttpRequest {
  const url =
    nextPageUrl ??
    `${repoRoot(input)}/pipelines/${encodeURIComponent(pipelineUuid)}/steps/`;

  return {
    method: 'GET',
    url,
    headers: buildHeaders(credentials),
    body: undefined,
  };
}

export function buildStepLogRequest(
  input: DeployLogsInput,
  credentials: BitbucketCredentials,
  pipelineUuid: string,
  stepUuid: string,
): HttpRequest {
  const url =
    `${repoRoot(input)}/pipelines/${encodeURIComponent(pipelineUuid)}` +
    `/steps/${encodeURIComponent(stepUuid)}/log`;

  return {
    method: 'GET',
    url,
    headers: {
      Authorization: buildAuthorizationHeader(credentials),
      Accept: '*/*',
    },
    body: undefined,
  };
}
