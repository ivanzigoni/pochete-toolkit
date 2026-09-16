/**
 * Loads `command-allowlist.json` — every AWS CLI service+operation pair this session may run
 * without a human, keyed by `"<service> <operation>"` (e.g. "sts get-caller-identity", "s3 ls"),
 * each value the rule enforced for it (see validate.ts for the rule shapes). A pair absent from
 * this object is denied; a missing or malformed file resolves to `{}` (nothing enabled), never
 * "allow everything" — same fallback direction shared/json-registry.ts already gives every other
 * tool's registry. Two-level key because the aws CLI itself has two mandatory levels of
 * subcommand (service, then operation), unlike railway-safe-cli's single-level `command`.
 *
 * This file physically lives inside the tool (not beside a hook) by design — the allowlist is
 * tool-level, enforced here in TypeScript. enforce-aws-cli-scope.sh (this repo's
 * .claude/hooks/pctk__enforce-aws-cli-scope/) protects the file itself from being read or edited
 * by the agent through any tool; it does not know or enforce what any individual rule means.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonRegistry } from '../../shared/json-registry.js';
import type { CommandRule } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests can point this at a temp fixture instead of the real, gitignored
// command-allowlist.json — mirrors auth-profiles.ts's own override.
function registryPath(): string {
  return (
    process.env.POCHETE_AWS_SAFE_CLI_COMMAND_ALLOWLIST_FILE ??
    path.join(moduleDir, 'command-allowlist.json')
  );
}

function commandKey(service: string, operation: string): string {
  return `${service} ${operation}`;
}

export function loadCommandAllowlist(): Readonly<Record<string, CommandRule>> {
  return loadJsonRegistry<Record<string, CommandRule>>(registryPath(), {});
}

export function resolveCommandRule(service: string, operation: string): CommandRule {
  const allowlist = loadCommandAllowlist();
  const key = commandKey(service, operation);
  const rule = allowlist[key];
  if (!rule) {
    const registered = Object.keys(allowlist);
    const registeredClause =
      registered.length > 0
        ? ` — registered: ${registered.join(', ')}`
        : ' — nothing is registered yet';
    throw new Error(
      `aws command "${key}" is not enabled in this session's allowlist (command-allowlist.json)${registeredClause}. Ask a human to add it, with the right rule — the agent cannot edit that file itself.`,
    );
  }
  return rule;
}
