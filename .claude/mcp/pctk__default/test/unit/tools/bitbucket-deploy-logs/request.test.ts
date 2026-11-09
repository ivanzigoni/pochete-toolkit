import { describe, expect, it } from 'vitest';
import {
  buildListPipelinesRequest,
  buildListStepsRequest,
  buildStepLogRequest,
} from '../../../../src/tools/bitbucket-deploy-logs/request.js';

const CREDENTIALS = { email: 'dev@example.com', apiToken: 'test-token-value' };

const BASE_INPUT = {
  workspace: 'my-workspace',
  repoSlug: 'my-repo',
  commitHash: 'abc123def456',
};

describe('buildListPipelinesRequest', () => {
  it('targets the correct Bitbucket Cloud endpoint, URL-encoding workspace and repoSlug', () => {
    const request = buildListPipelinesRequest(
      { ...BASE_INPUT, workspace: 'my workspace', repoSlug: 'my/repo' },
      CREDENTIALS,
    );
    expect(request.method).toBe('GET');
    expect(request.url.startsWith('https://api.bitbucket.org/2.0/repositories/my%20workspace/my%2Frepo/pipelines/?')).toBe(true);
  });

  it('sends a BBQL q filter on target.commit.hash, sorted by -created_on', () => {
    const request = buildListPipelinesRequest(BASE_INPUT, CREDENTIALS);
    const params = new URL(request.url).searchParams;
    expect(params.get('q')).toBe('target.commit.hash="abc123def456"');
    expect(params.get('sort')).toBe('-created_on');
  });

  it('sends a Basic auth header built from email:apiToken, base64-encoded', () => {
    const request = buildListPipelinesRequest(BASE_INPUT, CREDENTIALS);
    const expected = `Basic ${Buffer.from('dev@example.com:test-token-value').toString('base64')}`;
    expect(request.headers.Authorization).toBe(expected);
  });
});

describe('buildListStepsRequest', () => {
  it('targets the steps endpoint for the given pipeline uuid when no nextPageUrl is given', () => {
    const request = buildListStepsRequest(BASE_INPUT, CREDENTIALS, '{pipeline-uuid}', undefined);
    expect(request.method).toBe('GET');
    expect(request.url).toBe(
      'https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/pipelines/%7Bpipeline-uuid%7D/steps/',
    );
  });

  it('uses nextPageUrl verbatim when given, ignoring pipelineUuid', () => {
    const request = buildListStepsRequest(
      BASE_INPUT,
      CREDENTIALS,
      '{pipeline-uuid}',
      'https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/pipelines/{pipeline-uuid}/steps/?page=2',
    );
    expect(request.url).toBe(
      'https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/pipelines/{pipeline-uuid}/steps/?page=2',
    );
  });
});

describe('buildStepLogRequest', () => {
  it('targets the step log endpoint and accepts any content type', () => {
    const request = buildStepLogRequest(BASE_INPUT, CREDENTIALS, '{pipeline-uuid}', '{step-uuid}');
    expect(request.method).toBe('GET');
    expect(request.url).toBe(
      'https://api.bitbucket.org/2.0/repositories/my-workspace/my-repo/pipelines/%7Bpipeline-uuid%7D/steps/%7Bstep-uuid%7D/log',
    );
    expect(request.headers.Accept).toBe('*/*');
  });
});
