import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// This server's own tools directory, one level above src/shared/ — each tool's .env is colocated
// with its own code at src/tools/<toolName>/.env, never a single file shared by every tool. Same
// explicit-path reasoning as before: the process's cwd depends on whatever spawned it, never
// assumed to be this directory.
const TOOLS_ROOT = path.join(moduleDir, '..', 'tools');

// Not a config value — a *pointer* to which .env file to parse, bypassing per-tool path
// resolution entirely when set. Read once per instantiation like everything else here, never
// cached; exists only so tests (unit and e2e alike) can point this class at an isolated temp
// file instead of writing to — or depending on the absence of — a tool's real .env.
const ENV_FILE_OVERRIDE_VAR = 'POCHETE_MCP_ENV_FILE';

function readEnvFile(envPath: string): Record<string, string> {
  try {
    return dotenv.parse(readFileSync(envPath, 'utf-8'));
  } catch (err) {
    // Mirrors dotenv.config()'s own behavior for a missing file: no-op rather than throw. Any
    // other read failure (permissions, etc.) is a real, unexpected condition and still surfaces.
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Structures one tool's own .env into a typed snapshot, parsed fresh from disk on every
 * instantiation — no process.env involved (read or written) and no caching, so editing a tool's
 * .env on disk takes effect on the very next tool call, with no server restart.
 *
 * Each tool's env lives at src/tools/<toolName>/.env, colocated with that tool's own code —
 * there is no shared root .env; a var one tool needs is invisible to another tool's EnvConfig
 * instance unless the same var is deliberately duplicated into both files. Each tool call should
 * create exactly one instance and reuse it for every value it needs during that call, rather
 * than one instance per field read — that way a single call sees one consistent snapshot of the
 * file, even if it happens to be edited mid-call.
 */
export class EnvConfig {
  private readonly raw: Record<string, string>;

  constructor(toolName: string) {
    const envPath =
      process.env[ENV_FILE_OVERRIDE_VAR] || path.join(TOOLS_ROOT, toolName, '.env');
    this.raw = readEnvFile(envPath);
  }

  /**
   * Raw lookup by var name. Which var name belongs to which registered profile (safe-curl's
   * cookie, bitbucket-open-pr's credential pair, a connection's password) is each tool's own
   * single JSON config file (auth-profiles.json, config.json — one per tool, see each tool's own
   * loader), not something this class knows about.
   */
  getRaw(name: string): string | undefined {
    return this.raw[name];
  }
}
