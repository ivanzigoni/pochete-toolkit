import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function formatEnvLine(key: string, value: string): string {
  // Every value is double-quoted so cookie/token-shaped values containing '=', ';', or spaces
  // (e.g. safe-curl's auth cookie) round-trip through dotenv.parse unchanged.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

/**
 * Writes `vars` as a temporary .env-format file, isolated from both the real .env and
 * process.env — the seam EnvConfig (src/shared/env-config.ts) is built around: point it at this
 * file via the POCHETE_MCP_ENV_FILE var (in-process for unit tests, in the spawned child's env
 * for e2e tests) instead of writing to the real .env or mutating process.env config values
 * directly.
 *
 * Omitting a key from `vars` entirely means "not present in the file" (real absence, not an
 * empty override) — pass `''` explicitly for a case that needs to simulate "configured but
 * blank".
 */
export async function writeTempEnvFile(
  vars: Record<string, string>,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pochete-mcp-env-'));
  const filePath = path.join(dir, '.env');
  const content = Object.entries(vars)
    .map(([key, value]) => formatEnvLine(key, value))
    .join('\n');
  await writeFile(filePath, content, 'utf8');

  return {
    path: filePath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
