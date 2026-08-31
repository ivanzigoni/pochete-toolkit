import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { demuxDockerLogStream, stripAnsiCodes } from './demux.js';
import { fetchRawContainerLogs, listContainers } from './docker-client.js';
import { requireConfiguredEnvironment, resolveCredential } from './environments.js';
import { resolveContainerId } from './resolve-container.js';
import { requireRegisteredServiceIn } from './services.js';

const DEFAULT_TAIL = 200;
const MAX_TAIL = 5000;

const INPUT_SHAPE = {
  environment: z
    .enum(['hml', 'prd'])
    .describe(
      'Which registered Portainer environment to reach (see config.json). "hml" and ' +
        '"prd" are both fully configured — a future environment added to the enum before its ' +
        'host/endpointId/stackNamespace are filled in would fail by name instead.',
    ),
  service: z
    .string()
    .min(1)
    .describe(
      'Which registered service to pull logs from — registered for the given environment ' +
        'specifically (see config.json; environments don\'t share configuration, so the same ' +
        'name may be registered for one and not the other). An unregistered value returns an ' +
        'error listing the services actually registered for that environment.',
    ),
  tail: z
    .number()
    .int()
    .positive()
    .max(MAX_TAIL)
    .optional()
    .describe(`Number of most recent log lines to fetch. Defaults to ${DEFAULT_TAIL}.`),
  includeStopped: z
    .boolean()
    .optional()
    .describe(
      'Default false: resolves only the currently running container, same as before — fails ' +
        "if none is running. Set true right after a suspected crash: Docker's container list " +
        'excludes stopped containers by default, so a container that crashed and was already ' +
        'replaced by Swarm becomes unreachable within moments — true also lists stopped ' +
        'containers and prefers the most recently exited one over a freshly started ' +
        'replacement, since the replacement has no history of whatever crashed its predecessor.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerPortainerGetContainerLogsTool(server: McpServer): void {
  server.registerTool(
    'portainer-get-container-logs',
    {
      title: 'Fetch recent container logs for a registered service via the Portainer API',
      description:
        'Resolves the running container for a given registered service inside a given environment\'s ' +
        'Swarm stack (matching the "com.docker.swarm.service.name" label against ' +
        '"<stackNamespace>_<service>" — plain service-name matching is not enough, since more ' +
        'than one stack can run the identical service set on the same Portainer endpoint), then ' +
        "fetches its logs and returns them as clean text: Docker's raw multiplexed stream " +
        'framing and ANSI color codes are both stripped before the result is returned. ' +
        'Credentials are injected server-side from this MCP server\'s own .env, the same as ' +
        'safe-curl, and never appear as a tool argument or in chat. Pass includeStopped: true ' +
        'when investigating a suspected crash — otherwise a container that already died and ' +
        "was replaced by Swarm is invisible to this tool's default (running-only) resolution, " +
        "even moments after the crash; the response's containerState field reports which state " +
        '("running"/"exited") was actually resolved.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const env = requireConfiguredEnvironment(input.environment);
        requireRegisteredServiceIn(env.services, input.service);
        const credential = resolveCredential(
          input.environment,
          new EnvConfig('portainer-get-container-logs'),
        );
        const tail = input.tail ?? DEFAULT_TAIL;

        const startedAt = Date.now();
        const containers = await listContainers(env, credential, {
          all: input.includeStopped,
        });
        const containerId = resolveContainerId(containers, env.stackNamespace, input.service, {
          includeStopped: input.includeStopped,
        });
        const containerState = containers.find((c) => c.Id === containerId)?.State;
        const rawLogs = await fetchRawContainerLogs(env, credential, containerId, tail);
        const durationMs = Date.now() - startedAt;

        const logs = demuxDockerLogStream(rawLogs)
          .map((frame) => stripAnsiCodes(frame.text))
          .join('');

        const payload = {
          environment: input.environment,
          service: input.service,
          containerId,
          containerState,
          tail,
          durationMs,
          logs,
        };

        const summary = {
          environment: input.environment,
          service: input.service,
          containerId,
          containerState,
          tail,
          durationMs,
          logsLength: logs.length,
        };

        return await finalizeToolOutput({
          toolName: 'portainer-get-container-logs',
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
