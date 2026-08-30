// A registered environment as it exists on disk in config.json's "environments" section — host/endpointId/
// stackNamespace are nullable because an environment (e.g. "prd") can be declared in the schema
// before its real values are known, the same "declared but not yet configured" shape
// auth-profiles.json's env vars use (see safe-curl/auth-profiles.ts). `services` is scoped to this
// one environment, never shared with another — environments don't share configuration, so hml and
// prd each declare their own set even when the two happen to be identical in practice. An
// environment with no services configured yet is `[]`, not `null`: unlike host/endpointId/
// stackNamespace there's no ambiguity between "empty list" and "not configured".
export interface RawPortainerEnvironment {
  readonly envVar: string;
  readonly host: string | null;
  readonly endpointId: number | null;
  readonly headerName: string;
  readonly stackNamespace: string | null;
  readonly services: readonly string[];
}

// Same shape with every nullable field asserted present — what requireConfiguredEnvironment
// returns after checking, so downstream code never re-checks for null.
export interface ConfiguredPortainerEnvironment {
  readonly envVar: string;
  readonly host: string;
  readonly endpointId: number;
  readonly headerName: string;
  readonly stackNamespace: string;
  readonly services: readonly string[];
}

// Only the fields this tool actually reads from Portainer's container-list response — the real
// payload carries many more (Image, Mounts, NetworkSettings, ...).
export interface PortainerContainer {
  readonly Id: string;
  readonly Labels?: Record<string, string>;
  readonly State?: string;
  readonly Status?: string;
  readonly Created?: number;
}
