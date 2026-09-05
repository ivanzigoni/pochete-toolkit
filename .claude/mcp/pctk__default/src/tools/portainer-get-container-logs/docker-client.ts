// Thin driver around `undici`, same shape as safe-curl/http.ts, so the e2e suite's global
// undici->fake-undici.mjs redirect (test/fixtures/fake-driver-loader.mjs, applied via NODE_OPTIONS
// regardless of which file does the importing) covers this tool too with no extra wiring.
import { fetch } from 'undici';

import type { ConfiguredPortainerEnvironment, PortainerContainer } from './types.js';

const DOCKER_API_VERSION = 'v1.41';

export class PortainerRequestError extends Error {}

function buildUrl(env: ConfiguredPortainerEnvironment, path: string): string {
  return `https://${env.host}/api/endpoints/${env.endpointId}/docker/${DOCKER_API_VERSION}${path}`;
}

export async function listContainers(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  options?: { all?: boolean },
): Promise<PortainerContainer[]> {
  // Docker's /containers/json defaults to running containers only. A container that just
  // crashed and was replaced by Swarm is gone from that default list within moments of the
  // replacement — options.all keeps recently-exited containers visible long enough to fetch
  // their logs (see resolve-container.ts's includeStopped mode).
  const path = options?.all ? '/containers/json?all=true' : '/containers/json';
  const response = await fetch(buildUrl(env, path), {
    headers: { [env.headerName]: credential },
  });
  if (response.status !== 200) {
    throw new PortainerRequestError(
      `Portainer returned ${response.status} listing containers on "${env.host}"`,
    );
  }
  return (await response.json()) as PortainerContainer[];
}

// Read as raw bytes, never as text — see demux.ts's doc comment for why a UTF-8-decoded copy of
// this response cannot be demultiplexed correctly.
export async function fetchRawContainerLogs(
  env: ConfiguredPortainerEnvironment,
  credential: string,
  containerId: string,
  tail: number,
): Promise<Buffer> {
  const path = `/containers/${containerId}/logs?stdout=1&stderr=1&tail=${tail}`;
  const response = await fetch(buildUrl(env, path), {
    headers: { [env.headerName]: credential },
  });
  if (response.status !== 200) {
    throw new PortainerRequestError(
      `Portainer returned ${response.status} fetching logs for container ${containerId}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}
