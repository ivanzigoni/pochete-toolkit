import type { DockerInspect, DockerStats, SwarmTask } from './schemas.js';
import type {
  BlockIoMetrics,
  CpuMetrics,
  MemoryMetrics,
  NetworkMetrics,
  PidsMetrics,
  RecentTask,
  StateInfo,
} from './types.js';

const NANOS_PER_CPU = 1_000_000_000;
const FAILED_TASK_STATES: readonly string[] = ['failed', 'rejected'];

function onlineCpusOf(stats: DockerStats): number | null {
  const cpu = stats.cpu_stats;
  if (cpu?.online_cpus !== undefined) return cpu.online_cpus;
  const perCpuLength = cpu?.cpu_usage?.percpu_usage?.length;
  return perCpuLength !== undefined && perCpuLength > 0 ? perCpuLength : null;
}

export function computeCpuPercent(stats: DockerStats): number | null {
  const current = stats.cpu_stats;
  const previous = stats.precpu_stats;
  if (
    current?.cpu_usage === undefined ||
    current.system_cpu_usage === undefined ||
    previous?.cpu_usage === undefined ||
    previous.system_cpu_usage === undefined
  ) {
    return null;
  }

  const cpuDelta = current.cpu_usage.total_usage - previous.cpu_usage.total_usage;
  const systemDelta = current.system_cpu_usage - previous.system_cpu_usage;
  const onlineCpus = onlineCpusOf(stats) ?? 1;
  if (systemDelta <= 0 || cpuDelta < 0) return null;
  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

export function buildCpuMetrics(stats: DockerStats, inspect: DockerInspect): CpuMetrics {
  const nanoCpus = inspect.HostConfig?.NanoCpus;
  const throttling = stats.cpu_stats?.throttling_data;
  return {
    percent: computeCpuPercent(stats),
    onlineCpus: onlineCpusOf(stats),
    limitCpus: nanoCpus !== undefined && nanoCpus > 0 ? nanoCpus / NANOS_PER_CPU : null,
    throttledPeriods: throttling?.throttled_periods ?? null,
    throttledTimeNs: throttling?.throttled_time ?? null,
  };
}

function inactiveFileBytes(memoryStats: Readonly<Record<string, number>>): number | undefined {
  return memoryStats.total_inactive_file ?? memoryStats.inactive_file;
}

export function buildMemoryMetrics(stats: DockerStats): MemoryMetrics {
  const memory = stats.memory_stats;
  const rawUsage = memory?.usage;
  if (memory === undefined || rawUsage === undefined) {
    return {
      usageBytes: null,
      rawUsageBytes: null,
      limitBytes: memory?.limit ?? null,
      percent: null,
      maxUsageBytes: memory?.max_usage ?? null,
    };
  }

  const inactive = memory.stats === undefined ? undefined : inactiveFileBytes(memory.stats);
  const usage = inactive !== undefined && inactive < rawUsage ? rawUsage - inactive : rawUsage;
  const { limit } = memory;
  return {
    usageBytes: usage,
    rawUsageBytes: rawUsage,
    limitBytes: limit ?? null,
    percent: limit !== undefined && limit > 0 ? (usage / limit) * 100 : null,
    maxUsageBytes: memory.max_usage ?? null,
  };
}

export function buildNetworkMetrics(stats: DockerStats): NetworkMetrics | null {
  if (stats.networks === undefined || stats.networks === null) return null;
  const totals = { rxBytes: 0, txBytes: 0, rxErrors: 0, txErrors: 0, rxDropped: 0, txDropped: 0 };
  for (const iface of Object.values(stats.networks)) {
    totals.rxBytes += iface.rx_bytes ?? 0;
    totals.txBytes += iface.tx_bytes ?? 0;
    totals.rxErrors += iface.rx_errors ?? 0;
    totals.txErrors += iface.tx_errors ?? 0;
    totals.rxDropped += iface.rx_dropped ?? 0;
    totals.txDropped += iface.tx_dropped ?? 0;
  }
  return totals;
}

export function buildBlockIoMetrics(stats: DockerStats): BlockIoMetrics | null {
  const entries = stats.blkio_stats?.io_service_bytes_recursive;
  if (entries === undefined || entries === null) return null;
  let readBytes = 0;
  let writeBytes = 0;
  for (const entry of entries) {
    const op = entry.op.toLowerCase();
    if (op === 'read') readBytes += entry.value;
    else if (op === 'write') writeBytes += entry.value;
  }
  return { readBytes, writeBytes };
}

export function buildPidsMetrics(stats: DockerStats): PidsMetrics {
  const limit = stats.pids_stats?.limit;
  return {
    current: stats.pids_stats?.current ?? null,
    limit: limit !== undefined && limit > 0 ? limit : null,
  };
}

export function buildStateInfo(inspect: DockerInspect): StateInfo {
  const state = inspect.State;
  const health = state?.Health;
  return {
    status: state?.Status ?? null,
    startedAt: state?.StartedAt ?? null,
    finishedAt: state?.FinishedAt ?? null,
    exitCode: state?.ExitCode ?? null,
    oomKilled: state?.OOMKilled ?? null,
    error: state?.Error ?? null,
    restartCount: inspect.RestartCount ?? null,
    health:
      health === undefined || health === null
        ? null
        : { status: health.Status, failingStreak: health.FailingStreak ?? null },
  };
}

function updatedAtMillis(task: SwarmTask): number {
  if (task.UpdatedAt === undefined) return Number.NEGATIVE_INFINITY;
  const millis = Date.parse(task.UpdatedAt);
  return Number.isNaN(millis) ? Number.NEGATIVE_INFINITY : millis;
}

function toRecentTask(task: SwarmTask): RecentTask {
  return {
    id: task.ID,
    desiredState: task.DesiredState ?? null,
    state: task.Status?.State ?? null,
    message: task.Status?.Message ?? null,
    error: task.Status?.Err ?? null,
    exitCode: task.Status?.ContainerStatus?.ExitCode ?? null,
    containerId: task.Status?.ContainerStatus?.ContainerID ?? null,
    createdAt: task.CreatedAt ?? null,
    updatedAt: task.UpdatedAt ?? null,
  };
}

function byUpdatedAtDesc(a: SwarmTask, b: SwarmTask): number {
  const left = updatedAtMillis(a);
  const right = updatedAtMillis(b);
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function buildRecentTasks(tasks: readonly SwarmTask[], limit: number): RecentTask[] {
  return [...tasks].sort(byUpdatedAtDesc).slice(0, limit).map(toRecentTask);
}

export function countFailedTasks(tasks: readonly RecentTask[]): number {
  return tasks.filter((task) => task.state !== null && FAILED_TASK_STATES.includes(task.state))
    .length;
}
