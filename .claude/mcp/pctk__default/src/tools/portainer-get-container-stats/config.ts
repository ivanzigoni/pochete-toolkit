import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonRegistry } from '../../shared/json-registry.js';
import type { RawPortainerEnvironment } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface ToolConfig {
  readonly environments: Readonly<Record<string, RawPortainerEnvironment>>;
}

const EMPTY_CONFIG: ToolConfig = { environments: {} };

function configPath(): string {
  return process.env.POCHETE_PORTAINER_STATS_CONFIG_FILE ?? path.join(moduleDir, 'config.json');
}

export function loadConfig(): ToolConfig {
  return loadJsonRegistry<ToolConfig>(configPath(), EMPTY_CONFIG);
}
