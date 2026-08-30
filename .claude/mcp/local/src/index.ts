import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerBitbucketOpenPrTool } from './tools/bitbucket-open-pr/register.js';
import { registerDelegateReasoningTool } from './tools/delegate-reasoning/register.js';
import { registerPortainerGetContainerLogsTool } from './tools/portainer-get-container-logs/register.js';
import { registerSafeCurlTool } from './tools/safe-curl/register.js';
import { registerSafeQueryTool } from './tools/safe-query/register.js';

// .env is no longer loaded here — each tool reads it fresh per call via src/shared/env-config.ts
// (EnvConfig), so editing it takes effect on the next tool call without a server restart. Each
// tool's own single JSON config file (auth-profiles.json, config.json) is read the same way,
// fresh per call — see src/shared/json-registry.ts.

const server = new McpServer({ name: 'local', version: '1.0.0' });

// Add more [name, registerXTool] entries here as more tools join this server.
const REGISTRARS: readonly (readonly [string, (server: McpServer) => void])[] = [
  ['safe-query', registerSafeQueryTool],
  ['safe-curl', registerSafeCurlTool],
  ['bitbucket-open-pr', registerBitbucketOpenPrTool],
  ['portainer-get-container-logs', registerPortainerGetContainerLogsTool],
  ['delegate-reasoning', registerDelegateReasoningTool],
];

// One tool failing to register (e.g. an unexpected error building its input schema) must never
// take the others down with it — caught here and logged to stderr (stdout is the stdio
// transport's own JSON-RPC channel, never a place for diagnostic output), skipping just that tool.
for (const [name, register] of REGISTRARS) {
  try {
    register(server);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[local-mcp] failed to register tool "${name}", skipping: ${message}`);
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
