import { describe, expect, it } from 'vitest';
import {
  BitbucketApiError,
  parseListPipelinesResponse,
  parseListStepsResponse,
  parseStepLogResponse,
} from '../../../../src/tools/bitbucket-deploy-logs/response.js';

function jsonResponse(status: number, statusText: string, payload: unknown) {
  return { status, statusText, body: JSON.stringify(payload) };
}

const INPUT = { workspace: 'my-workspace', repoSlug: 'my-repo', commitHash: 'abc123def456' };

describe('parseListPipelinesResponse', () => {
  it('extracts uuid, buildNumber and state from the first value on a successful response', () => {
    const result = parseListPipelinesResponse(
      jsonResponse(200, 'OK', {
        values: [
          { uuid: '{pipeline-uuid}', build_number: 42, state: { name: 'COMPLETED' } },
          { uuid: '{older-pipeline-uuid}', build_number: 41, state: { name: 'COMPLETED' } },
        ],
      }),
      INPUT,
    );
    expect(result).toEqual({ uuid: '{pipeline-uuid}', buildNumber: 42, state: 'COMPLETED' });
  });

  it('throws BitbucketApiError, naming the commit and repo, when values is empty', () => {
    expect(() => parseListPipelinesResponse(jsonResponse(200, 'OK', { values: [] }), INPUT)).toThrow(
      BitbucketApiError,
    );
    expect(() =>
      parseListPipelinesResponse(jsonResponse(200, 'OK', { values: [] }), INPUT),
    ).toThrow(/abc123def456/);
  });

  it('throws BitbucketApiError carrying the API error message on a non-2xx response', () => {
    expect(() =>
      parseListPipelinesResponse(
        jsonResponse(400, 'Bad Request', { type: 'error', error: { message: 'invalid query' } }),
        INPUT,
      ),
    ).toThrow(/invalid query/);
  });

  it('throws BitbucketApiError, including a body excerpt, on a non-JSON response', () => {
    expect(() =>
      parseListPipelinesResponse(
        { status: 502, statusText: 'Bad Gateway', body: '<html>upstream failure</html>' },
        INPUT,
      ),
    ).toThrow(/upstream failure/);
  });
});

describe('parseListStepsResponse', () => {
  it('extracts uuid, name and result state for each step', () => {
    const result = parseListStepsResponse(
      jsonResponse(200, 'OK', {
        values: [
          { uuid: '{step-1}', name: 'Build', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } },
          { uuid: '{step-2}', name: 'Deploy', state: { name: 'COMPLETED', result: { name: 'FAILED' } } },
        ],
      }),
    );
    expect(result.steps).toEqual([
      { uuid: '{step-1}', name: 'Build', state: 'SUCCESSFUL' },
      { uuid: '{step-2}', name: 'Deploy', state: 'FAILED' },
    ]);
    expect(result.next).toBeUndefined();
  });

  it('falls back to state.name when a step has no result yet, and to uuid when it has no name', () => {
    const result = parseListStepsResponse(
      jsonResponse(200, 'OK', {
        values: [{ uuid: '{step-1}', state: { name: 'IN_PROGRESS' } }],
      }),
    );
    expect(result.steps).toEqual([{ uuid: '{step-1}', name: '{step-1}', state: 'IN_PROGRESS' }]);
  });

  it('surfaces the next page URL when present', () => {
    const result = parseListStepsResponse(
      jsonResponse(200, 'OK', { values: [], next: 'https://api.bitbucket.org/.../steps/?page=2' }),
    );
    expect(result.next).toBe('https://api.bitbucket.org/.../steps/?page=2');
  });

  it('throws BitbucketApiError on a non-2xx response', () => {
    expect(() =>
      parseListStepsResponse(jsonResponse(404, 'Not Found', { type: 'error', error: { message: 'no such pipeline' } })),
    ).toThrow(/no such pipeline/);
  });
});

describe('parseStepLogResponse', () => {
  const step = { uuid: '{step-1}', name: 'Deploy', state: 'SUCCESSFUL' };

  it('returns the raw text body on a successful response', () => {
    const result = parseStepLogResponse({ status: 200, statusText: 'OK', body: 'line one\nline two\n' }, step);
    expect(result).toBe('line one\nline two\n');
  });

  it('throws BitbucketApiError, naming the step, on a non-2xx response', () => {
    expect(() =>
      parseStepLogResponse({ status: 404, statusText: 'Not Found', body: '' }, step),
    ).toThrow(/Deploy/);
  });
});
