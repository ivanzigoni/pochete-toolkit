import { sendHttpRequest } from './http.js';
import {
  buildListPipelinesRequest,
  buildListStepsRequest,
  buildStepLogRequest,
} from './request.js';
import { parseListPipelinesResponse, parseListStepsResponse, parseStepLogResponse } from './response.js';
import type { BitbucketCredentials, DeployLogsInput, DeployLogsResult, PipelineStep } from './types.js';

async function fetchAllSteps(
  input: DeployLogsInput,
  credentials: BitbucketCredentials,
  pipelineUuid: string,
): Promise<PipelineStep[]> {
  const steps: PipelineStep[] = [];
  let nextPageUrl: string | undefined;

  do {
    const request = buildListStepsRequest(input, credentials, pipelineUuid, nextPageUrl);
    // Sequential by necessity, not by choice: page 2's URL only exists inside page 1's response
    // (Bitbucket's own `next` cursor), so there is nothing to parallelize here.
    // eslint-disable-next-line no-await-in-loop -- see comment above
    const response = await sendHttpRequest(request);
    const page = parseListStepsResponse(response);
    steps.push(...page.steps);
    nextPageUrl = page.next;
  } while (nextPageUrl !== undefined);

  return steps;
}

async function fetchStepLog(
  input: DeployLogsInput,
  credentials: BitbucketCredentials,
  pipelineUuid: string,
  step: PipelineStep,
): Promise<string> {
  const request = buildStepLogRequest(input, credentials, pipelineUuid, step.uuid);
  const response = await sendHttpRequest(request);
  return parseStepLogResponse(response, step);
}

function formatCombinedLogs(steps: readonly PipelineStep[], logsByStep: readonly string[]): string {
  return steps
    .map((step, index) => `=== ${step.name} (${step.state}) ===\n${logsByStep[index]}\n`)
    .join('\n');
}

export async function fetchDeployLogs(
  input: DeployLogsInput,
  credentials: BitbucketCredentials,
): Promise<DeployLogsResult> {
  const pipelineRequest = buildListPipelinesRequest(input, credentials);
  const pipelineResponse = await sendHttpRequest(pipelineRequest);
  const pipeline = parseListPipelinesResponse(pipelineResponse, input);

  const steps = await fetchAllSteps(input, credentials, pipeline.uuid);

  const logsByStep: string[] = [];
  for (const step of steps) {
    // Sequential, not Promise.all: keeps this tool's outbound request rate against the Bitbucket
    // API predictable and easy to reason about from the logs, and a deploy pipeline's steps are
    // few enough (single digits) that the latency cost of not parallelizing is negligible.
    // eslint-disable-next-line no-await-in-loop -- sequential by design, see comment above
    logsByStep.push(await fetchStepLog(input, credentials, pipeline.uuid, step));
  }

  return {
    commitHash: input.commitHash,
    pipelineUuid: pipeline.uuid,
    buildNumber: pipeline.buildNumber,
    pipelineState: pipeline.state,
    steps,
    logs: formatCombinedLogs(steps, logsByStep),
  };
}
