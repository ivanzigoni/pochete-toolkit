import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Writes `content` as a temporary JSON file, isolated from the real one — the same seam
 * writeTempEnvFile (env-file.ts) gives .env-backed config, applied to a registry file
 * (environments.json, connection-profiles.json) instead: point the module's own path-override env
 * var at this file rather than relying on the real, gitignored registry.
 */
export async function writeTempJsonFile(
  fileName: string,
  content: unknown,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cem-mcp-json-'));
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');

  return {
    path: filePath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
