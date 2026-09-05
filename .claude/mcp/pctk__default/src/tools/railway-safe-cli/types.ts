export interface RailwayAuthProfile {
  readonly envVar: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId?: string;
}

export interface VerbRule {
  readonly bareAllowed?: boolean;
  readonly flagImpliesAllowed?: boolean;
  readonly allowedVerbs?: readonly string[];
}

export interface CommandRule {
  readonly requireFlag?: string;
  readonly requireAnyFlag?: readonly string[];
  readonly forbidLongFlags?: readonly string[];
  readonly forbidShortFlags?: readonly string[];
  readonly forbidTokenPrefix?: string;
  readonly verbRule?: VerbRule;
}

export interface RailwayExecResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}
