import type { PortainerContainer } from './schemas.js';

const SERVICE_NAME_LABEL = 'com.docker.swarm.service.name';

export class ContainerResolutionError extends Error {}

export function swarmServiceName(stackNamespace: string, service: string): string {
  return `${stackNamespace}_${service}`;
}

export function resolveContainerId(
  containers: readonly PortainerContainer[],
  stackNamespace: string,
  service: string,
  options?: { includeStopped?: boolean },
): string {
  const expectedServiceName = swarmServiceName(stackNamespace, service);
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

  const byCreatedDesc = [...matches].sort((a, b) => (b.Created ?? 0) - (a.Created ?? 0));
  const mostRecentExited = byCreatedDesc.find((container) => container.State === 'exited');
  return (mostRecentExited ?? byCreatedDesc[0]!).Id;
}
