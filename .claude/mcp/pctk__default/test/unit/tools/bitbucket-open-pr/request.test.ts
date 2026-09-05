import { describe, expect, it } from 'vitest';
import { buildCreatePullRequestRequest } from '../../../../src/tools/bitbucket-open-pr/request.js';

const CREDENTIALS = { email: 'dev@example.com', apiToken: 'test-token-value' };

const BASE_INPUT = {
  workspace: 'my-workspace',
  repoSlug: 'my-repo',
  title: 'Fix billing rounding',
  sourceBranch: 'fix/billing-rounding',
  destinationBranch: 'main',
};

describe('buildCreatePullRequestRequest', () => {
  it('targets the correct Bitbucket Cloud endpoint, URL-encoding workspace and repoSlug', () => {
    const request = buildCreatePullRequestRequest(
      { ...BASE_INPUT, workspace: 'my workspace', repoSlug: 'my/repo' },
      CREDENTIALS,
    );
    expect(request.method).toBe('POST');
    expect(request.url).toBe(
      'https://api.bitbucket.org/2.0/repositories/my%20workspace/my%2Frepo/pullrequests',
    );
  });

  it('sends a Basic auth header built from email:apiToken, base64-encoded', () => {
    const request = buildCreatePullRequestRequest(BASE_INPUT, CREDENTIALS);
    const expected = `Basic ${Buffer.from('dev@example.com:test-token-value').toString('base64')}`;
    expect(request.headers.Authorization).toBe(expected);
  });

  it('builds a JSON body with title, source branch and destination branch only, by default', () => {
    const request = buildCreatePullRequestRequest(BASE_INPUT, CREDENTIALS);
    expect(JSON.parse(request.body ?? '')).toEqual({
      title: 'Fix billing rounding',
      source: { branch: { name: 'fix/billing-rounding' } },
      destination: { branch: { name: 'main' } },
    });
  });

  it('includes description and close_source_branch only when provided', () => {
    const request = buildCreatePullRequestRequest(
      { ...BASE_INPUT, description: 'Rounds cents down instead of up.', closeSourceBranch: true },
      CREDENTIALS,
    );
    expect(JSON.parse(request.body ?? '')).toMatchObject({
      description: 'Rounds cents down instead of up.',
      close_source_branch: true,
    });
  });

  it('sets Content-Type and Accept to application/json', () => {
    const request = buildCreatePullRequestRequest(BASE_INPUT, CREDENTIALS);
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(request.headers.Accept).toBe('application/json');
  });
});
