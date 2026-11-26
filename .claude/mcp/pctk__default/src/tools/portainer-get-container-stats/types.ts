export interface RawPortainerEnvironment {
  readonly envVar: string;
  readonly host: string | null;
  readonly endpointId: number | null;
  readonly headerName: string;
  readonly stackNamespace: string | null;
  readonly services: readonly string[];
}

export interface ConfiguredPortainerEnvironment {
  readonly envVar: string;
  readonly host: string;
  readonly endpointId: number;
  readonly headerName: string;
  readonly stackNamespace: string;
  readonly services: readonly string[];
}

export interface CpuMetrics {
  readonly percent: number | null;
  readonly onlineCpus: number | null;
  readonly limitCpus: number | null;
  readonly throttledPeriods: number | null;
  readonly throttledTimeNs: number | null;
}

export interface MemoryMetrics {
  readonly usageBytes: number | null;
  readonly rawUsageBytes: number | null;
  readonly limitBytes: number | null;
  readonly percent: number | null;
  readonly maxUsageBytes: number | null;
}

export interface NetworkMetrics {
  readonly rxBytes: number;
  readonly txBytes: number;
  readonly rxErrors: number;
  readonly txErrors: number;
  readonly rxDropped: number;
  readonly txDropped: number;
}

export interface BlockIoMetrics {
  readonly readBytes: number;
  readonly writeBytes: number;
}

export interface PidsMetrics {
  readonly current: number | null;
  readonly limit: number | null;
}

export interface HealthInfo {
  readonly status: string;
  readonly failingStreak: number | null;
}

export interface StateInfo {
  readonly status: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly exitCode: number | null;
  readonly oomKilled: boolean | null;
  readonly error: string | null;
  readonly restartCount: number | null;
  readonly health: HealthInfo | null;
}

export interface RecentTask {
  readonly id: string;
  readonly desiredState: string | null;
  readonly state: string | null;
  readonly message: string | null;
  readonly error: string | null;
  readonly exitCode: number | null;
  readonly containerId: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
