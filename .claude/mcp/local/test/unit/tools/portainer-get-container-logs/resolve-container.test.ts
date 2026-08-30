import { describe, expect, it } from 'vitest';
import {
  ContainerResolutionError,
  resolveContainerId,
} from '../../../../src/tools/portainer-get-container-logs/resolve-container.js';
import type { PortainerContainer } from '../../../../src/tools/portainer-get-container-logs/types.js';

function container(
  serviceName: string | undefined,
  id: string,
  extra?: Partial<PortainerContainer>,
): PortainerContainer {
  return {
    Id: id,
    Labels: serviceName === undefined ? {} : { 'com.docker.swarm.service.name': serviceName },
    ...extra,
  };
}

describe('resolveContainerId', () => {
  it('resolves the single container whose label matches "<stackNamespace>_<service>"', () => {
    const containers = [
      container('stack-hml_svc-a', 'billing-id'),
      container('stack-hml_svc-b', 'tomb-id'),
    ];
    expect(resolveContainerId(containers, 'stack-hml', 'svc-a')).toBe(
      'billing-id',
    );
  });

  it('does not match a container whose service name is right but stackNamespace is wrong', () => {
    // Reproduces the real "hml" endpoint also running a "stack-release" stack with the
    // identical service set — matching on service name alone would pick the wrong stack.
    const containers = [
      container('stack-release_svc-a', 'release-id'),
      container('stack-hml_svc-a', 'hml-id'),
    ];
    expect(resolveContainerId(containers, 'stack-hml', 'svc-a')).toBe(
      'hml-id',
    );
  });

  it('throws ContainerResolutionError, naming the service and stack, when there are 0 matches', () => {
    const containers = [container('stack-hml_svc-b', 'tomb-id')];
    expect(() =>
      resolveContainerId(containers, 'stack-hml', 'svc-a'),
    ).toThrow(ContainerResolutionError);
    expect(() =>
      resolveContainerId(containers, 'stack-hml', 'svc-a'),
    ).toThrow(/svc-a.*stack-hml/);
  });

  it('throws ContainerResolutionError, listing every matched id, when there is more than 1 match', () => {
    const containers = [
      container('stack-hml_svc-a', 'id-1'),
      container('stack-hml_svc-a', 'id-2'),
    ];
    expect(() =>
      resolveContainerId(containers, 'stack-hml', 'svc-a'),
    ).toThrow(ContainerResolutionError);
    expect(() =>
      resolveContainerId(containers, 'stack-hml', 'svc-a'),
    ).toThrow(/id-1, id-2/);
  });

  it('ignores containers with no Labels at all', () => {
    const containers: PortainerContainer[] = [
      { Id: 'no-labels-id' },
      container('stack-hml_svc-a', 'billing-id'),
    ];
    expect(resolveContainerId(containers, 'stack-hml', 'svc-a')).toBe(
      'billing-id',
    );
  });

  it('throws for an empty container list', () => {
    expect(() => resolveContainerId([], 'stack-hml', 'svc-a')).toThrow(
      ContainerResolutionError,
    );
  });

  describe('includeStopped: true (crash investigation mode)', () => {
    it('prefers the most recently exited container over a freshly started replacement', () => {
      // Reproduces a real crash investigation: the container that crashed processing the request
      // is still "exited" and visible when the caller asked for stopped containers too, but
      // resolving to the newer "running" replacement would show none of that history.
      const containers = [
        container('stack-prd_svc-c', 'crashed-id', {
          State: 'exited',
          Created: 1000,
        }),
        container('stack-prd_svc-c', 'replacement-id', {
          State: 'running',
          Created: 2000,
        }),
      ];
      expect(
        resolveContainerId(containers, 'stack-prd', 'svc-c', {
          includeStopped: true,
        }),
      ).toBe('crashed-id');
    });

    it('falls back to the most recently created match when none is exited', () => {
      const containers = [
        container('stack-prd_svc-c', 'older-id', {
          State: 'running',
          Created: 1000,
        }),
        container('stack-prd_svc-c', 'newer-id', {
          State: 'running',
          Created: 2000,
        }),
      ];
      expect(
        resolveContainerId(containers, 'stack-prd', 'svc-c', {
          includeStopped: true,
        }),
      ).toBe('newer-id');
    });

    it('picks the most recently exited among more than one exited match', () => {
      const containers = [
        container('stack-prd_svc-c', 'oldest-crash-id', {
          State: 'exited',
          Created: 1000,
        }),
        container('stack-prd_svc-c', 'latest-crash-id', {
          State: 'exited',
          Created: 3000,
        }),
        container('stack-prd_svc-c', 'replacement-id', {
          State: 'running',
          Created: 4000,
        }),
      ];
      expect(
        resolveContainerId(containers, 'stack-prd', 'svc-c', {
          includeStopped: true,
        }),
      ).toBe('latest-crash-id');
    });

    it('does not throw on multiple matches, unlike the default (includeStopped: false) mode', () => {
      const containers = [
        container('stack-prd_svc-c', 'a', { Created: 1 }),
        container('stack-prd_svc-c', 'b', { Created: 2 }),
      ];
      expect(() =>
        resolveContainerId(containers, 'stack-prd', 'svc-c', {
          includeStopped: true,
        }),
      ).not.toThrow();
    });
  });
});
