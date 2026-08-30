import { readFileSync } from 'node:fs';

/**
 * Reads and parses one tool's own JSON config file (auth-profiles.json, config.json — each tool
 * has exactly one), fresh from disk on every call
 * — no caching, mirroring EnvConfig's own readEnvFile in this same shared/ directory. A missing
 * file (ENOENT) resolves to `fallback` instead of throwing, the same treatment readEnvFile gives a
 * missing .env; any other read/parse failure still propagates.
 *
 * Every call site invokes this from inside its tool's handler, never at module top-level — that
 * is what keeps one tool's missing or malformed registry from crashing the shared MCP server
 * during import, before any tool has even been registered.
 */
export function loadJsonRegistry<T>(registryPath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(registryPath, 'utf-8')) as T;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return fallback;
    throw err;
  }
}
