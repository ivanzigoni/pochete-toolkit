export interface ParsedCurlRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}
