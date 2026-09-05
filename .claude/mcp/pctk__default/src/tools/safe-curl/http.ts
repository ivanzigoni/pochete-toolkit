// Thin driver around the `undici` package — the one place in this tool that talks to the network
// directly, the same way safe-query's db/postgres.ts and db/mssql.ts wrap `pg`/`mssql` and
// nothing else in the tool imports either package. This is what lets the e2e suite swap `undici`
// for an in-memory fake (test/fixtures/fake-undici.mjs) via fake-driver-loader.mjs without
// touching this file.
import { fetch } from 'undici';

import type { HttpRequest, HttpResponse } from './types.js';

export async function sendHttpRequest(request: HttpRequest): Promise<HttpResponse> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { status: response.status, statusText: response.statusText, headers, body };
}
