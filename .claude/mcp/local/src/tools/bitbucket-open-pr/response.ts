import type { HttpResponse, PullRequestResult } from './types.js';

export class BitbucketApiError extends Error {}

function extractBitbucketErrorMessage(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    return undefined;
  }
  const { error } = parsed as { error: unknown };
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return undefined;
  }
  const { message } = error as { message: unknown };
  return typeof message === 'string' ? message : undefined;
}

interface BitbucketPullRequestPayload {
  readonly id: number;
  readonly title: string;
  readonly state: string;
  readonly links: { readonly html: { readonly href: string } };
  readonly source: { readonly branch: { readonly name: string } };
  readonly destination: { readonly branch: { readonly name: string } };
}

export function parseCreatePullRequestResponse(response: HttpResponse): PullRequestResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    throw new BitbucketApiError(
      `Bitbucket returned a non-JSON response (status ${response.status} ${response.statusText}): ${response.body.slice(
        0,
        500,
      )}`,
    );
  }

  if (response.status < 200 || response.status >= 300) {
    const message = extractBitbucketErrorMessage(parsed) ?? response.statusText;
    throw new BitbucketApiError(
      `Bitbucket rejected the pull request (status ${response.status}): ${message}`,
    );
  }

  const pr = parsed as BitbucketPullRequestPayload;
  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    url: pr.links.html.href,
    sourceBranch: pr.source.branch.name,
    destinationBranch: pr.destination.branch.name,
  };
}
