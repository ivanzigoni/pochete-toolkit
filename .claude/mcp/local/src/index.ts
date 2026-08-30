import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerBitbucketOpenPrTool } from './tools/bitbucket-open-pr/register.js';
import { registerDelegateReasoningTool } from './tools/delegate-reasoning/register.js';
import { registerPortainerGetContainerLogsTool } from './tools/portainer-get-container-logs/register.js';
import { registerSafeCurlTool } from './tools/safe-curl/register.js';
import { registerSafeQueryTool } from './tools/safe-query/register.js';

// .env is no longer loaded here — each tool reads it fresh per call via src/shared/env-config.ts
// (EnvConfig), so editing it takes effect on the next tool call without a server restart.

const server = new McpServer({ name: 'local', version: '1.0.0' });

registerSafeQueryTool(server);
registerSafeCurlTool(server);
registerBitbucketOpenPrTool(server);
registerPortainerGetContainerLogsTool(server);
registerDelegateReasoningTool(server);
// Add more registerXTool(server) calls here as more tools join this server.

const transport = new StdioServerTransport();
await server.connect(transport);
