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

export interface OpenPullRequestInput {
  readonly workspace: string;
  readonly repoSlug: string;
  readonly title: string;
  readonly sourceBranch: string;
  readonly destinationBranch: string;
  readonly description?: string;
  readonly closeSourceBranch?: boolean;
}

export interface BitbucketCredentials {
  readonly email: string;
  readonly apiToken: string;
}

export interface PullRequestResult {
  readonly id: number;
  readonly title: string;
  readonly state: string;
  readonly url: string;
  readonly sourceBranch: string;
  readonly destinationBranch: string;
}
