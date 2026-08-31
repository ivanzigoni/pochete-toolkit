/**
 * Loads this tool's single JSON config file — `config.json` — holding both the registered
 * connection profiles and the LGPD mask-columns lists, the two pieces of data safe-query needs
 * beyond its own .env. One file per tool, the same contract every other tool in this server
 * follows (auth-profiles.json, portainer-get-container-logs' own config.json).
 *
 * Read fresh on every call, never at module load time: a missing or malformed config.json must
 * only ever fail this one tool's own call, inside its handler's own try/catch — never the process
 * import chain that every other tool in this server shares. See shared/json-registry.ts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonRegistry } from '../../shared/json-registry.js';
import type { ConnectionProfile, MaskColumnsRegistry } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface ToolConfig {
  readonly connections: Readonly<Record<string, ConnectionProfile>>;
  readonly maskColumns: MaskColumnsRegistry;
}

const EMPTY_CONFIG: ToolConfig = { connections: {}, maskColumns: { partial: [], full: [] } };

// Overridable so tests (unit and e2e alike) can point this at a temp fixture instead of the real,
// gitignored config.json — mirrors EnvConfig's own POCHETE_MCP_ENV_FILE override for .env.
// Resolved fresh inside loadConfig(), never cached at module load time, so a test that sets this
// var after the module has already been imported (the in-process unit-test case) still takes
// effect on its next call.
function configPath(): string {
  return process.env.POCHETE_SAFE_QUERY_CONFIG_FILE ?? path.join(moduleDir, 'config.json');
}

export function loadConfig(): ToolConfig {
  return loadJsonRegistry<ToolConfig>(configPath(), EMPTY_CONFIG);
}
