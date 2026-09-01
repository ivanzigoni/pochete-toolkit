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

export interface CreateIssueInput {
  readonly projectKey: string;
  readonly issueType: string;
  readonly summary: string;
  readonly description?: string;
  readonly labels?: readonly string[];
}

export interface JiraCredentials {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
}

export interface CreateIssueResult {
  readonly id: string;
  readonly key: string;
  readonly self: string;
}
