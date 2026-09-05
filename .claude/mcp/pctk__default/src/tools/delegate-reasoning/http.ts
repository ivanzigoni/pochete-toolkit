// Thin driver around the `undici` package — the one place in this tool that talks to the network
// directly, mirroring safe-curl's/bitbucket-open-pr's http.ts. This is what lets the e2e suite
// swap `undici` for an in-memory fake (test/fixtures/fake-undici.mjs) via fake-driver-loader.mjs
// without touching this file.
import { fetch } from 'undici';

import type { HttpRequest, HttpResponse } from './types.js';

export async function sendHttpRequest(request: HttpRequest): Promise<HttpResponse> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const body = await response.text();
  return { status: response.status, statusText: response.statusText, body };
}
