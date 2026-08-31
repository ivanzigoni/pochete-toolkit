import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveAuthCredential, resolveAuthHeaderName } from './auth-profiles.js';
import { sendHttpRequest } from './http.js';
import { parseCurlCommand } from './parse.js';
import { redactSensitiveHeaders } from './redact.js';
import { assertNoInlineAuthHeaders } from './validate.js';

const INPUT_SHAPE = {
  curl: z
    .string()
    .describe(
      "A full curl command, as copied from browser devtools ('Copy as cURL'), MINUS any " +
        'Cookie or Authorization header, and MINUS whatever header the chosen authProfile ' +
        'injects if different (see headerName in auth-profiles.json) — this tool injects that ' +
        'itself, server-side, from the env var registered for authProfile, and mechanically ' +
        'rejects the command if any of those headers is present.',
    ),
  authProfile: z
    .string()
    .min(1)
    .describe(
      'Which registered credential/host profile to use (see auth-profiles.json). No default — ' +
        'always state it explicitly. An unregistered value returns an error listing the ' +
        'profiles actually registered.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerSafeCurlTool(server: McpServer): void {
  server.registerTool(
    'safe-curl',
    {
      title: 'Run a pasted curl command with the auth credential injected server-side',
      description:
        'Parses a pasted curl command (method, URL, headers, body — no real shell, no real ' +
        "curl binary involved) and executes it, injecting an auth header from this server's " +
        "own .env — Cookie by default, or the header configured on the given authProfile (see " +
        "headerName in auth-profiles.json, e.g. X-API-Key) — using the env var registered for " +
        'that profile. The curl must not itself set a Cookie, Authorization, or (when the ' +
        'profile uses a different header) that header either — rejected mechanically, not just ' +
        'by convention, so the real credential value never has to appear as a tool argument or ' +
        'in chat. Response headers that could carry a credential back (set-cookie, ' +
        'www-authenticate, proxy-authenticate, or any header name containing "auth"/"token") ' +
        'are redacted before being returned or written to disk.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const parsed = parseCurlCommand(input.curl);
        const headerName = resolveAuthHeaderName(input.authProfile);
        assertNoInlineAuthHeaders(parsed.headers, headerName);
        const authCredential = resolveAuthCredential(input.authProfile, new EnvConfig('safe-curl'));

        const startedAt = Date.now();
        const response = await sendHttpRequest({
          ...parsed,
          headers: { ...parsed.headers, [headerName]: authCredential },
        });
        const durationMs = Date.now() - startedAt;

        const redactedHeaders = redactSensitiveHeaders(response.headers);

        const payload = {
          method: parsed.method,
          url: parsed.url,
          status: response.status,
          statusText: response.statusText,
          durationMs,
          headers: redactedHeaders,
          body: response.body,
        };

        const summary = {
          method: payload.method,
          url: payload.url,
          status: payload.status,
          statusText: payload.statusText,
          durationMs: payload.durationMs,
          headers: payload.headers,
          bodyLength: response.body.length,
        };

        return await finalizeToolOutput({
          toolName: 'safe-curl',
          payload,
          summary,
          outputFileName: input.outputFileName,
          outputDir: input.outputDir,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    },
  );
}
