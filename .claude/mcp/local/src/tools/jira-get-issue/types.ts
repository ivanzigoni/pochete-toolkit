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

export interface GetIssueInput {
  readonly issueKey: string;
  readonly fields?: readonly string[];
}

export interface JiraCredentials {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
}

export interface GetIssueResult {
  readonly key: string;
  readonly id: string;
  readonly self: string;
  readonly fields: Record<string, unknown>;
}
