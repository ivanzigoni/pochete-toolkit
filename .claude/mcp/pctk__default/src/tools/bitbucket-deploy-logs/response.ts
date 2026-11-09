import type { DeployLogsInput, HttpResponse, PipelineStep, PipelineSummary } from './types.js';

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

function parseJsonBody(response: HttpResponse, context: string): unknown {
  try {
    return JSON.parse(response.body);
  } catch {
    throw new BitbucketApiError(
      `Bitbucket returned a non-JSON response while ${context} (status ${response.status} ` +
        `${response.statusText}): ${response.body.slice(0, 500)}`,
    );
  }
}

function assertSuccess(response: HttpResponse, parsed: unknown, context: string): void {
  if (response.status < 200 || response.status >= 300) {
    const message = extractBitbucketErrorMessage(parsed) ?? response.statusText;
    throw new BitbucketApiError(`Bitbucket rejected the request while ${context} (status ${response.status}): ${message}`);
  }
}

interface BitbucketPipelinePayload {
  readonly uuid: string;
  readonly build_number: number;
  readonly state: { readonly name: string };
}

interface BitbucketPipelinesListPayload {
  readonly values: readonly BitbucketPipelinePayload[];
}

export function parseListPipelinesResponse(
  response: HttpResponse,
  input: DeployLogsInput,
): PipelineSummary {
  const parsed = parseJsonBody(response, 'listing pipelines');
  assertSuccess(response, parsed, 'listing pipelines');

  const { values } = parsed as BitbucketPipelinesListPayload;
  const pipeline = values[0];
  if (!pipeline) {
    throw new BitbucketApiError(
      `no pipeline found for commit ${input.commitHash} in ${input.workspace}/${input.repoSlug}`,
    );
  }

  return {
    uuid: pipeline.uuid,
    buildNumber: pipeline.build_number,
    state: pipeline.state.name,
  };
}

interface BitbucketStepPayload {
  readonly uuid: string;
  readonly name?: string;
  readonly state?: { readonly name?: string; readonly result?: { readonly name?: string } };
}

interface BitbucketStepsListPayload {
  readonly values: readonly BitbucketStepPayload[];
  readonly next?: string;
}

export interface ParsedStepsPage {
  readonly steps: readonly PipelineStep[];
  readonly next: string | undefined;
}

function stepState(step: BitbucketStepPayload): string {
  return step.state?.result?.name ?? step.state?.name ?? 'UNKNOWN';
}

export function parseListStepsResponse(response: HttpResponse): ParsedStepsPage {
  const parsed = parseJsonBody(response, 'listing pipeline steps');
  assertSuccess(response, parsed, 'listing pipeline steps');

  const { values, next } = parsed as BitbucketStepsListPayload;
  return {
    steps: values.map((step) => ({
      uuid: step.uuid,
      name: step.name ?? step.uuid,
      state: stepState(step),
    })),
    next,
  };
}

export function parseStepLogResponse(response: HttpResponse, step: PipelineStep): string {
  if (response.status < 200 || response.status >= 300) {
    throw new BitbucketApiError(
      `Bitbucket rejected the request while fetching the log for step "${step.name}" ` +
        `(status ${response.status}): ${response.statusText}`,
    );
  }
  return response.body;
}
