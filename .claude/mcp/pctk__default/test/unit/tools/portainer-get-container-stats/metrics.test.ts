import { describe, expect, it } from 'vitest';

import {
  buildBlockIoMetrics,
  buildCpuMetrics,
  buildMemoryMetrics,
  buildNetworkMetrics,
  buildPidsMetrics,
  buildRecentTasks,
  buildStateInfo,
  computeCpuPercent,
  countFailedTasks,
} from '../../../../src/tools/portainer-get-container-stats/metrics.js';
import type {
  DockerInspect,
  DockerStats,
  SwarmTask,
} from '../../../../src/tools/portainer-get-container-stats/schemas.js';

const GIB = 1024 ** 3;

function cpuStats(overrides: Partial<DockerStats> = {}): DockerStats {
  return {
    cpu_stats: {
      cpu_usage: { total_usage: 2_000_000_000 },
      system_cpu_usage: 20_000_000_000,
      online_cpus: 4,
      throttling_data: { periods: 100, throttled_periods: 12, throttled_time: 345_000 },
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1_000_000_000 },
      system_cpu_usage: 10_000_000_000,
      online_cpus: 4,
    },
    ...overrides,
  };
}

describe('computeCpuPercent', () => {
  it('applies (cpuDelta / systemDelta) * onlineCpus * 100', () => {
    expect(computeCpuPercent(cpuStats())).toBeCloseTo(40);
  });

  it('falls back to percpu_usage length when online_cpus is absent', () => {
    const stats = cpuStats({
      cpu_stats: {
        cpu_usage: { total_usage: 2_000_000_000, percpu_usage: [1, 1] },
        system_cpu_usage: 20_000_000_000,
      },
    });
    expect(computeCpuPercent(stats)).toBeCloseTo(20);
  });

  it('returns null when precpu_stats has no system_cpu_usage (first sample)', () => {
    const stats = cpuStats({ precpu_stats: { cpu_usage: { total_usage: 0 } } });
    expect(computeCpuPercent(stats)).toBeNull();
  });

  it('returns null when cpu_stats is absent', () => {
    expect(computeCpuPercent({})).toBeNull();
  });

  it('returns null when the system delta is not positive', () => {
    const stats = cpuStats({
      precpu_stats: {
        cpu_usage: { total_usage: 1_000_000_000 },
        system_cpu_usage: 20_000_000_000,
      },
    });
    expect(computeCpuPercent(stats)).toBeNull();
  });

  it('returns 0 for an idle container (zero cpu delta, positive system delta)', () => {
    const stats = cpuStats({
      precpu_stats: {
        cpu_usage: { total_usage: 2_000_000_000 },
        system_cpu_usage: 10_000_000_000,
      },
    });
    expect(computeCpuPercent(stats)).toBe(0);
  });
});

describe('buildCpuMetrics', () => {
  it('reports percent, online cpus, NanoCpus limit and throttling', () => {
    const inspect: DockerInspect = { Id: 'x', HostConfig: { NanoCpus: 1_500_000_000 } };
    expect(buildCpuMetrics(cpuStats(), inspect)).toEqual({
      percent: expect.closeTo(40),
      onlineCpus: 4,
      limitCpus: 1.5,
      throttledPeriods: 12,
      throttledTimeNs: 345_000,
    });
  });

  it('reports a null limit when NanoCpus is 0 or absent', () => {
    expect(
      buildCpuMetrics(cpuStats(), { Id: 'x', HostConfig: { NanoCpus: 0 } }).limitCpus,
    ).toBeNull();
    expect(buildCpuMetrics(cpuStats(), { Id: 'x' }).limitCpus).toBeNull();
  });

  it('reports null throttling when throttling_data is absent', () => {
    const stats = cpuStats({ cpu_stats: { cpu_usage: { total_usage: 1 } } });
    const metrics = buildCpuMetrics(stats, { Id: 'x' });
    expect(metrics.throttledPeriods).toBeNull();
    expect(metrics.throttledTimeNs).toBeNull();
  });
});

describe('buildMemoryMetrics', () => {
  it('subtracts inactive_file on cgroup v2', () => {
    const stats: DockerStats = {
      memory_stats: { usage: 600, limit: 1000, stats: { inactive_file: 100, anon: 450 } },
    };
    expect(buildMemoryMetrics(stats)).toEqual({
      usageBytes: 500,
      rawUsageBytes: 600,
      limitBytes: 1000,
      percent: 50,
      maxUsageBytes: null,
    });
  });

  it('subtracts total_inactive_file on cgroup v1 and reports max_usage', () => {
    const stats: DockerStats = {
      memory_stats: {
        usage: 800,
        max_usage: 900,
        limit: 2000,
        stats: { total_inactive_file: 300, cache: 350, inactive_file: 300 },
      },
    };
    expect(buildMemoryMetrics(stats)).toEqual({
      usageBytes: 500,
      rawUsageBytes: 800,
      limitBytes: 2000,
      percent: 25,
      maxUsageBytes: 900,
    });
  });

  it('keeps raw usage when the inactive_file value is not smaller than usage', () => {
    const stats: DockerStats = {
      memory_stats: { usage: 100, limit: 1000, stats: { inactive_file: 100 } },
    };
    expect(buildMemoryMetrics(stats).usageBytes).toBe(100);
  });

  it('keeps raw usage when no stats map is present', () => {
    const stats: DockerStats = { memory_stats: { usage: 100, limit: GIB } };
    expect(buildMemoryMetrics(stats).usageBytes).toBe(100);
  });

  it('reports a null percent when the limit is absent or zero', () => {
    expect(buildMemoryMetrics({ memory_stats: { usage: 100 } }).percent).toBeNull();
    expect(buildMemoryMetrics({ memory_stats: { usage: 100, limit: 0 } }).percent).toBeNull();
  });

  it('reports every field as null when memory_stats is absent', () => {
    expect(buildMemoryMetrics({})).toEqual({
      usageBytes: null,
      rawUsageBytes: null,
      limitBytes: null,
      percent: null,
      maxUsageBytes: null,
    });
  });
});

describe('buildNetworkMetrics', () => {
  it('sums every interface', () => {
    const stats: DockerStats = {
      networks: {
        eth0: {
          rx_bytes: 10,
          tx_bytes: 20,
          rx_errors: 1,
          tx_errors: 0,
          rx_dropped: 2,
          tx_dropped: 0,
        },
        eth1: {
          rx_bytes: 5,
          tx_bytes: 5,
          rx_errors: 0,
          tx_errors: 3,
          rx_dropped: 0,
          tx_dropped: 4,
        },
      },
    };
    expect(buildNetworkMetrics(stats)).toEqual({
      rxBytes: 15,
      txBytes: 25,
      rxErrors: 1,
      txErrors: 3,
      rxDropped: 2,
      txDropped: 4,
    });
  });

  it('returns null when networks is absent or null', () => {
    expect(buildNetworkMetrics({})).toBeNull();
    expect(buildNetworkMetrics({ networks: null })).toBeNull();
  });
});

describe('buildBlockIoMetrics', () => {
  it('sums read and write ops regardless of case', () => {
    const stats: DockerStats = {
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: 'Read', value: 100 },
          { op: 'Write', value: 50 },
          { op: 'read', value: 1 },
          { op: 'write', value: 2 },
          { op: 'Total', value: 999 },
        ],
      },
    };
    expect(buildBlockIoMetrics(stats)).toEqual({ readBytes: 101, writeBytes: 52 });
  });

  it('returns zeros for an empty list', () => {
    expect(buildBlockIoMetrics({ blkio_stats: { io_service_bytes_recursive: [] } })).toEqual({
      readBytes: 0,
      writeBytes: 0,
    });
  });

  it('returns null when the list is absent or null', () => {
    expect(buildBlockIoMetrics({})).toBeNull();
    expect(buildBlockIoMetrics({ blkio_stats: { io_service_bytes_recursive: null } })).toBeNull();
  });
});

describe('buildPidsMetrics', () => {
  it('reports current and a positive limit', () => {
    expect(buildPidsMetrics({ pids_stats: { current: 42, limit: 512 } })).toEqual({
      current: 42,
      limit: 512,
    });
  });

  it('reports a null limit when it is 0 or absent', () => {
    expect(buildPidsMetrics({ pids_stats: { current: 42, limit: 0 } }).limit).toBeNull();
    expect(buildPidsMetrics({ pids_stats: { current: 42 } }).limit).toBeNull();
  });

  it('reports nulls when pids_stats is absent', () => {
    expect(buildPidsMetrics({})).toEqual({ current: null, limit: null });
  });
});

describe('buildStateInfo', () => {
  it('maps state, restart count and health', () => {
    const inspect: DockerInspect = {
      Id: 'x',
      RestartCount: 2,
      State: {
        Status: 'exited',
        OOMKilled: true,
        ExitCode: 137,
        Error: '',
        StartedAt: '2026-11-26T10:00:00Z',
        FinishedAt: '2026-11-26T11:00:00Z',
        Health: { Status: 'unhealthy', FailingStreak: 3 },
      },
    };
    expect(buildStateInfo(inspect)).toEqual({
      status: 'exited',
      startedAt: '2026-11-26T10:00:00Z',
      finishedAt: '2026-11-26T11:00:00Z',
      exitCode: 137,
      oomKilled: true,
      error: '',
      restartCount: 2,
      health: { status: 'unhealthy', failingStreak: 3 },
    });
  });

  it('reports a null health when the container has no healthcheck', () => {
    expect(buildStateInfo({ Id: 'x', State: { Status: 'running' } }).health).toBeNull();
    expect(
      buildStateInfo({ Id: 'x', State: { Status: 'running', Health: null } }).health,
    ).toBeNull();
  });

  it('reports nulls when State is absent', () => {
    expect(buildStateInfo({ Id: 'x' })).toEqual({
      status: null,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      oomKilled: null,
      error: null,
      restartCount: null,
      health: null,
    });
  });
});

describe('buildRecentTasks', () => {
  const tasks: SwarmTask[] = [
    { ID: 'old', UpdatedAt: '2026-11-26T08:00:00Z', Status: { State: 'shutdown' } },
    {
      ID: 'crashed',
      CreatedAt: '2026-11-26T09:00:00Z',
      UpdatedAt: '2026-11-26T09:30:00Z',
      DesiredState: 'shutdown',
      Status: {
        State: 'failed',
        Message: 'started',
        Err: 'task: non-zero exit (137)',
        ContainerStatus: { ContainerID: 'c-crashed', ExitCode: 137 },
      },
    },
    { ID: 'no-date', Status: { State: 'rejected' } },
    {
      ID: 'current',
      UpdatedAt: '2026-11-26T10:00:00Z',
      DesiredState: 'running',
      Status: { State: 'running', ContainerStatus: { ContainerID: 'c-current', ExitCode: 0 } },
    },
  ];

  it('orders by UpdatedAt descending, undated tasks last', () => {
    expect(buildRecentTasks(tasks, 10).map((task) => task.id)).toEqual([
      'current',
      'crashed',
      'old',
      'no-date',
    ]);
  });

  it('truncates to the given limit', () => {
    expect(buildRecentTasks(tasks, 2).map((task) => task.id)).toEqual(['current', 'crashed']);
  });

  it('maps every field of a failed task', () => {
    const crashed = buildRecentTasks(tasks, 10).find((task) => task.id === 'crashed');
    expect(crashed).toEqual({
      id: 'crashed',
      desiredState: 'shutdown',
      state: 'failed',
      message: 'started',
      error: 'task: non-zero exit (137)',
      exitCode: 137,
      containerId: 'c-crashed',
      createdAt: '2026-11-26T09:00:00Z',
      updatedAt: '2026-11-26T09:30:00Z',
    });
  });

  it('counts failed and rejected tasks', () => {
    expect(countFailedTasks(buildRecentTasks(tasks, 10))).toBe(2);
  });
});
