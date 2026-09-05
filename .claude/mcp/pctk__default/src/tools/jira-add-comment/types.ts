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

export interface AddCommentInput {
  readonly issueKey: string;
  readonly comment: string;
}

export interface JiraCredentials {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
}

export interface AddCommentResult {
  readonly id: string;
  readonly self: string;
  readonly authorDisplayName: string;
  readonly created: string;
}
