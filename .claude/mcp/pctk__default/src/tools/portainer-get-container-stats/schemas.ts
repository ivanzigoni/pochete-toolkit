import { z } from 'zod';

export const portainerContainerSchema = z.object({
  Id: z.string(),
  Labels: z.record(z.string()).nullish(),
  State: z.string().optional(),
  Status: z.string().optional(),
  Created: z.number().optional(),
});

export const portainerContainerListSchema = z.array(portainerContainerSchema);

export type PortainerContainer = z.infer<typeof portainerContainerSchema>;

const cpuStatsSchema = z.object({
  cpu_usage: z
    .object({
      total_usage: z.number(),
      percpu_usage: z.array(z.number()).nullish(),
    })
    .optional(),
  system_cpu_usage: z.number().optional(),
  online_cpus: z.number().optional(),
  throttling_data: z
    .object({
      periods: z.number().optional(),
      throttled_periods: z.number().optional(),
      throttled_time: z.number().optional(),
    })
    .optional(),
});

const networkInterfaceSchema = z.object({
  rx_bytes: z.number().optional(),
  tx_bytes: z.number().optional(),
  rx_errors: z.number().optional(),
  tx_errors: z.number().optional(),
  rx_dropped: z.number().optional(),
  tx_dropped: z.number().optional(),
});

const blkioEntrySchema = z.object({
  op: z.string(),
  value: z.number(),
});

export const dockerStatsSchema = z.object({
  read: z.string().optional(),
  cpu_stats: cpuStatsSchema.optional(),
  precpu_stats: cpuStatsSchema.optional(),
  memory_stats: z
    .object({
      usage: z.number().optional(),
      max_usage: z.number().optional(),
      limit: z.number().optional(),
      stats: z.record(z.number()).optional(),
    })
    .optional(),
  networks: z.record(networkInterfaceSchema).nullish(),
  blkio_stats: z
    .object({
      io_service_bytes_recursive: z.array(blkioEntrySchema).nullish(),
    })
    .optional(),
  pids_stats: z
    .object({
      current: z.number().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

export type DockerStats = z.infer<typeof dockerStatsSchema>;

export const dockerInspectSchema = z.object({
  Id: z.string(),
  Image: z.string().optional(),
  RestartCount: z.number().optional(),
  Config: z.object({ Image: z.string().optional() }).optional(),
  State: z
    .object({
      Status: z.string().optional(),
      OOMKilled: z.boolean().optional(),
      ExitCode: z.number().optional(),
      Error: z.string().optional(),
      StartedAt: z.string().optional(),
      FinishedAt: z.string().optional(),
      Health: z
        .object({
          Status: z.string(),
          FailingStreak: z.number().optional(),
        })
        .nullish(),
    })
    .optional(),
  HostConfig: z
    .object({
      Memory: z.number().optional(),
      NanoCpus: z.number().optional(),
    })
    .optional(),
});

export type DockerInspect = z.infer<typeof dockerInspectSchema>;

export const swarmTaskSchema = z.object({
  ID: z.string(),
  CreatedAt: z.string().optional(),
  UpdatedAt: z.string().optional(),
  DesiredState: z.string().optional(),
  Status: z
    .object({
      State: z.string().optional(),
      Message: z.string().optional(),
      Err: z.string().optional(),
      ContainerStatus: z
        .object({
          ContainerID: z.string().optional(),
          ExitCode: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const swarmTaskListSchema = z.array(swarmTaskSchema);

export type SwarmTask = z.infer<typeof swarmTaskSchema>;
