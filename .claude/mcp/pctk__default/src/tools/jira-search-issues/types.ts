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

export interface SearchIssuesInput {
  readonly jql: string;
  readonly fields?: readonly string[];
  readonly maxResults?: number;
  readonly nextPageToken?: string;
}

export interface JiraCredentials {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
}

export interface SearchIssuesResultItem {
  readonly key: string;
  readonly id: string;
  readonly fields: Record<string, unknown>;
}

export interface SearchIssuesResult {
  readonly issues: readonly SearchIssuesResultItem[];
  readonly isLast: boolean;
  readonly nextPageToken?: string;
}
