/**
 * Resolves exactly one running container for a given service inside a given Swarm stack, from an
 * already-fetched container list — filters client-side on the `com.docker.swarm.service.name`
 * label rather than passing Portainer's `filters` query param, keeping this a pure, synchronous
 * function with no HTTP/encoding concerns of its own to get wrong.
 *
 * Matching on stackNamespace is not optional: the same Portainer endpoint can host more than one
 * stack with the identical set of service names (confirmed live on the "hml" endpoint, which also
 * runs a "zelo-cemiterio-release" stack with every cem-* service duplicated) — filtering on
 * service name alone would silently match the wrong stack's container.
 */
import type { PortainerContainer } from './types.js';

const SERVICE_NAME_LABEL = 'com.docker.swarm.service.name';

export class ContainerResolutionError extends Error {}

export function resolveContainerId(
  containers: readonly PortainerContainer[],
  stackNamespace: string,
  service: string,
  options?: {
    // When set, `containers` is expected to include stopped ones too (caller passed
    // listContainers({ all: true })). Instead of requiring exactly one running match, prefer
    // the most recently exited container — the one that likely just crashed — over a freshly
    // started replacement, since the replacement has no history of whatever crashed its
    // predecessor. Falls back to the most recently created match of any state if none exited
    // (e.g. called before any crash happened).
    includeStopped?: boolean;
  },
): string {
  const expectedServiceName = `${stackNamespace}_${service}`;
  const matches = containers.filter(
    (container) => container.Labels?.[SERVICE_NAME_LABEL] === expectedServiceName,
  );

  if (matches.length === 0) {
    throw new ContainerResolutionError(
      `no container found for service "${service}" in stack "${stackNamespace}" ` +
        `(expected label ${SERVICE_NAME_LABEL}=${expectedServiceName})`,
    );
  }

  if (!options?.includeStopped) {
    if (matches.length > 1) {
      const ids = matches.map((container) => container.Id).join(', ');
      throw new ContainerResolutionError(
        `expected exactly one container for service "${service}" in stack "${stackNamespace}", ` +
          `found ${matches.length}: ${ids}`,
      );
    }
    return matches[0]!.Id;
  }

  const byCreatedDesc = [...matches].sort(
    (a, b) => (b.Created ?? 0) - (a.Created ?? 0),
  );
  const mostRecentExited = byCreatedDesc.find(
    (container) => container.State === 'exited',
  );
  return (mostRecentExited ?? byCreatedDesc[0]!).Id;
}
