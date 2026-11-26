import { fetch } from 'undici';
import type { z } from 'zod';

import {
  dockerInspectSchema,
  dockerStatsSchema,
  portainerContainerListSchema,
  swarmTaskListSchema,
} from './schemas.js';
import type { DockerInspect, DockerStats, PortainerContainer, SwarmTask } from './schemas.js';
import type { ConfiguredPortainerEnvironment } from './types.js';

const DOCKER_API_VERSION = 'v1.41';

export class PortainerRequestError extends Error {}

function buildUrl(env: ConfiguredPortainerEnvironment, path: string): string {
  return `https://${env.host}/api/endpoints/${env.endpointId}/docker/${DOCKER_API_VERSION}${path}`;
}

async function getJson<T>(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  path: string,
  what: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const response = await fetch(buildUrl(env, path), {
    headers: { [env.headerName]: credential },
  });
  if (response.status !== 200) {
    throw new PortainerRequestError(
      `Portainer returned ${response.status} ${what} on "${env.host}"`,
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new PortainerRequestError(
      `unexpected response shape ${what} on "${env.host}": ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export async function listContainers(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  options?: { all?: boolean },
): Promise<PortainerContainer[]> {
  const path = options?.all ? '/containers/json?all=true' : '/containers/json';
  return getJson(env, credential, path, 'listing containers', portainerContainerListSchema);
}

export async function fetchContainerStats(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  containerId: string,
): Promise<DockerStats> {
  const path = `/containers/${encodeURIComponent(containerId)}/stats?stream=false`;
  return getJson(
    env,
    credential,
    path,
    `fetching stats for container ${containerId}`,
    dockerStatsSchema,
  );
}

export async function inspectContainer(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  containerId: string,
): Promise<DockerInspect> {
  const path = `/containers/${encodeURIComponent(containerId)}/json`;
  return getJson(env, credential, path, `inspecting container ${containerId}`, dockerInspectSchema);
}

export async function listServiceTasks(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  swarmServiceName: string,
): Promise<SwarmTask[]> {
  const filters = encodeURIComponent(JSON.stringify({ service: [swarmServiceName] }));
  return getJson(
    env,
    credential,
    `/tasks?filters=${filters}`,
    `listing tasks for service ${swarmServiceName}`,
    swarmTaskListSchema,
  );
}
