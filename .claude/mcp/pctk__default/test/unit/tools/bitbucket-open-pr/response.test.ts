import { describe, expect, it } from 'vitest';
import {
  BitbucketApiError,
  parseCreatePullRequestResponse,
} from '../../../../src/tools/bitbucket-open-pr/response.js';

function jsonResponse(status: number, statusText: string, payload: unknown) {
  return { status, statusText, body: JSON.stringify(payload) };
}

describe('parseCreatePullRequestResponse', () => {
  it('extracts id, title, state, url and branch names from a successful (2xx) response', () => {
    const result = parseCreatePullRequestResponse(
      jsonResponse(201, 'Created', {
        id: 42,
        title: 'Fix billing rounding',
        state: 'OPEN',
        links: { html: { href: 'https://bitbucket.org/my-workspace/my-repo/pull-requests/42' } },
        source: { branch: { name: 'fix/billing-rounding' } },
        destination: { branch: { name: 'main' } },
      }),
    );
    expect(result).toEqual({
      id: 42,
      title: 'Fix billing rounding',
      state: 'OPEN',
      url: 'https://bitbucket.org/my-workspace/my-repo/pull-requests/42',
      sourceBranch: 'fix/billing-rounding',
      destinationBranch: 'main',
    });
  });

  it('throws BitbucketApiError carrying the API error message on a non-2xx response', () => {
    expect(() =>
      parseCreatePullRequestResponse(
        jsonResponse(400, 'Bad Request', {
          type: 'error',
          error: { message: 'source branch not found' },
        }),
      ),
    ).toThrow(BitbucketApiError);
    expect(() =>
      parseCreatePullRequestResponse(
        jsonResponse(400, 'Bad Request', {
          type: 'error',
          error: { message: 'source branch not found' },
        }),
      ),
    ).toThrow(/source branch not found/);
  });

  it('falls back to statusText when the error response has no error.message', () => {
    expect(() =>
      parseCreatePullRequestResponse(jsonResponse(403, 'Forbidden', { type: 'error' })),
    ).toThrow(/Forbidden/);
  });

  it('throws BitbucketApiError, including a body excerpt, on a non-JSON response', () => {
    expect(() =>
      parseCreatePullRequestResponse({
        status: 502,
        statusText: 'Bad Gateway',
        body: '<html>upstream failure</html>',
      }),
    ).toThrow(/upstream failure/);
  });
});
