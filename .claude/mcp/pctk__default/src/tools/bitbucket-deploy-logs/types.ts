export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly body: string;
}

export interface DeployLogsInput {
  readonly workspace: string;
  readonly repoSlug: string;
  readonly commitHash: string;
}

export interface BitbucketCredentials {
  readonly email: string;
  readonly apiToken: string;
}

export interface PipelineSummary {
  readonly uuid: string;
  readonly buildNumber: number;
  readonly state: string;
}

export interface PipelineStep {
  readonly uuid: string;
  readonly name: string;
  readonly state: string;
}

export interface DeployLogsResult {
  readonly commitHash: string;
  readonly pipelineUuid: string;
  readonly buildNumber: number;
  readonly pipelineState: string;
  readonly steps: readonly PipelineStep[];
  readonly logs: string;
}
