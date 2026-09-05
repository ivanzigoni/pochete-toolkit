import type { EnvConfig } from '../../shared/env-config.js';

export interface SafeQueryLimits {
  readonly timeoutSeconds: number;
  readonly maxRows: number;
}

const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_MAX_ROWS = 10_000;

/**
 * Query timeout and max row count for the safe-query tool — global across every connection
 * profile (see connection-profiles.ts), never a tool argument or a per-profile setting. Lives
 * here rather than on EnvConfig itself since it's a safe-query-specific concern, not something
 * every tool's EnvConfig needs to know about.
 */
export function resolveSafeQueryLimits(env: EnvConfig): SafeQueryLimits {
  return {
    timeoutSeconds: Number(env.getRaw('SAFE_QUERY_TIMEOUT_SECONDS') ?? DEFAULT_TIMEOUT_SECONDS),
    maxRows: Number(env.getRaw('SAFE_QUERY_MAX_ROWS') ?? DEFAULT_MAX_ROWS),
  };
}
