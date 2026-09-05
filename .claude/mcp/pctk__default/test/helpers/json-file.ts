import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Writes `content` as a temporary JSON file, isolated from the real one — the same seam
 * writeTempEnvFile (env-file.ts) gives .env-backed config, applied to a tool's own JSON config
 * file instead: point that module's own path-override env var at this file rather than relying
 * on the real, gitignored config (only the tools that expose such an override — currently
 * portainer-get-container-logs's config.json — can use this seam; safe-query's config.json has
 * no override yet and is exercised only through its pure, registry-as-parameter functions).
 */
export async function writeTempJsonFile(
  fileName: string,
  content: unknown,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pochete-mcp-json-'));
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');

  return {
    path: filePath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
