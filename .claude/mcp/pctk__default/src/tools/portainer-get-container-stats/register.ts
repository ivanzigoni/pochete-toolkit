import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import {
  fetchContainerStats,
  inspectContainer,
  listContainers,
  listServiceTasks,
} from './docker-client.js';
import { requireConfiguredEnvironment, resolveCredential } from './environments.js';
import {
  buildBlockIoMetrics,
  buildCpuMetrics,
  buildMemoryMetrics,
  buildNetworkMetrics,
  buildPidsMetrics,
  buildRecentTasks,
  buildStateInfo,
  countFailedTasks,
} from './metrics.js';
import { resolveContainerId, swarmServiceName } from './resolve-container.js';
import type { DockerInspect, DockerStats } from './schemas.js';
import { requireRegisteredServiceIn } from './services.js';
import type {
  BlockIoMetrics,
  ConfiguredPortainerEnvironment,
  CpuMetrics,
  MemoryMetrics,
  NetworkMetrics,
  PidsMetrics,
  RecentTask,
} from './types.js';

const TOOL_NAME = 'portainer-get-container-stats';
const DEFAULT_TASKS_LIMIT = 10;
const MAX_TASKS_LIMIT = 50;

const INPUT_SHAPE = {
  environment: z
    .enum(['hml', 'prd'])
    .describe('Which registered Portainer environment to reach (see config.json).'),
  service: z
    .string()
    .min(1)
    .describe(
      'Which registered service to inspect — registered for the given environment specifically ' +
        '(see config.json). An unregistered value returns an error listing the services ' +
        'actually registered for that environment.',
    ),
  includeStopped: z
    .boolean()
    .optional()
    .describe(
      'Default false: resolves only the currently running container, failing if none is ' +
        'running. Set true after a suspected crash: also lists stopped containers and prefers ' +
        'the most recently exited one. For a non-running container, cpu/memory/network/blockIo/' +
        'pids come back null (Docker keeps no resource stats for it), while state and ' +
        'recentTasks are still filled in.',
    ),
  tasksLimit: z
    .number()
    .int()
    .positive()
    .max(MAX_TASKS_LIMIT)
    .optional()
    .describe(
      `How many of the service's most recent Swarm tasks to return, newest first. Defaults to ${DEFAULT_TASKS_LIMIT}.`,
    ),
  ...OUTPUT_FILE_SHAPE,
};

interface TasksOutcome {
  readonly recentTasks: RecentTask[] | null;
  readonly warning: string | null;
}

async function fetchRecentTasks(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  service: string,
  limit: number,
): Promise<TasksOutcome> {
  try {
    const tasks = await listServiceTasks(
      env,
      credential,
      swarmServiceName(env.stackNamespace, service),
    );
    return { recentTasks: buildRecentTasks(tasks, limit), warning: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { recentTasks: null, warning: `recentTasks unavailable: ${message}` };
  }
}

interface ResourceMetrics {
  readonly cpu: CpuMetrics | null;
  readonly memory: MemoryMetrics | null;
  readonly network: NetworkMetrics | null;
  readonly blockIo: BlockIoMetrics | null;
  readonly pids: PidsMetrics | null;
}

function buildResourceMetrics(stats: DockerStats | null, inspect: DockerInspect): ResourceMetrics {
  if (stats === null) {
    return { cpu: null, memory: null, network: null, blockIo: null, pids: null };
  }
  return {
    cpu: buildCpuMetrics(stats, inspect),
    memory: buildMemoryMetrics(stats),
    network: buildNetworkMetrics(stats),
    blockIo: buildBlockIoMetrics(stats),
    pids: buildPidsMetrics(stats),
  };
}

export function registerPortainerGetContainerStatsTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      title:
        'Fetch resource usage and health of a registered service container via the Portainer API',
      description:
        "Resolves a registered service's container inside a given environment's Swarm stack " +
        '(matching the "com.docker.swarm.service.name" label against "<stackNamespace>_<service>", ' +
        'same resolution as portainer-get-container-logs), then returns a one-shot snapshot for ' +
        'debugging resource problems: CPU percent, CPU limit and throttling; memory usage net of ' +
        'reclaimable page cache, raw usage, limit and percent; network and block I/O totals; PIDs; ' +
        'container state (OOMKilled, exit code, restart count, healthcheck); and the most recent ' +
        'Swarm tasks of the service, which expose restart loops and exit codes of containers Swarm ' +
        'already replaced. Read-only (GET requests only). Sampling CPU takes Docker about one to ' +
        "two seconds. Credentials are injected server-side from this tool's own .env and never " +
        'appear as an argument or in the output. If the task history cannot be fetched, ' +
        'recentTasks is null and the reason is listed in warnings, without failing the call.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const env = requireConfiguredEnvironment(input.environment);
        requireRegisteredServiceIn(env.services, input.service);
        const credential = resolveCredential(input.environment, new EnvConfig(TOOL_NAME));
        const tasksLimit = input.tasksLimit ?? DEFAULT_TASKS_LIMIT;

        const startedAt = Date.now();
        const containers = await listContainers(env, credential, { all: input.includeStopped });
        const containerId = resolveContainerId(containers, env.stackNamespace, input.service, {
          includeStopped: input.includeStopped,
        });
        const containerState = containers.find((c) => c.Id === containerId)?.State ?? null;

        const inspect = await inspectContainer(env, credential, containerId);
        const stats =
          containerState === 'running'
            ? await fetchContainerStats(env, credential, containerId)
            : null;
        const tasksOutcome = await fetchRecentTasks(env, credential, input.service, tasksLimit);
        const durationMs = Date.now() - startedAt;

        const warnings = tasksOutcome.warning === null ? [] : [tasksOutcome.warning];
        const common = {
          environment: input.environment,
          service: input.service,
          containerId,
          containerState,
          sampledAt: stats?.read ?? new Date().toISOString(),
          durationMs,
          ...buildResourceMetrics(stats, inspect),
          state: buildStateInfo(inspect),
          image: inspect.Config?.Image ?? inspect.Image ?? null,
          warnings,
        };

        const payload = { ...common, recentTasks: tasksOutcome.recentTasks };
        const summary = {
          ...common,
          recentTasksCount: tasksOutcome.recentTasks?.length ?? null,
          failedTasksCount:
            tasksOutcome.recentTasks === null ? null : countFailedTasks(tasksOutcome.recentTasks),
        };

        return await finalizeToolOutput({
          toolName: TOOL_NAME,
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
