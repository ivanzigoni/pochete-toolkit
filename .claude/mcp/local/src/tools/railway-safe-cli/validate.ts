/**
 * Applies a command-allowlist.json rule to a subcommand's args, and separately rejects any attempt
 * to set the Railway project/environment/service scope from `args` — those three come only from
 * the call's authProfile (see auth-profiles.ts) and are injected server-side in exec.ts, never
 * caller-supplied. Same "mechanical, not just convention" posture as safe-curl/validate.ts
 * rejecting an inline auth header.
 *
 * The rule shapes below (requireFlag, requireAnyFlag, forbidLongFlags, forbidShortFlags,
 * forbidTokenPrefix, verbRule) are a TypeScript port of the six shapes
 * enforce-git-allowlist.sh already validates in production for git subcommands — same engine,
 * same semantics, applied here to railway subcommands instead.
 */
import type { CommandRule } from './types.js';

export class RailwayCommandValidationError extends Error {}

const SCOPE_FLAG_EXACT = new Set(['--project', '-p', '--environment', '-e', '--service', '-s']);
const SCOPE_FLAG_PREFIXES = ['--project=', '--environment=', '--service='];

export function assertNoScopeOverride(args: readonly string[]): void {
  const found = args.find(
    (token) =>
      SCOPE_FLAG_EXACT.has(token) || SCOPE_FLAG_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
  if (found) {
    throw new RailwayCommandValidationError(
      `args must not set "${found}" — project/environment/service are fixed by the call's ` +
        'authProfile, never caller-supplied. Remove it from args and retry.',
    );
  }
}

// Deliberately coarse — matches a single-dash cluster containing letter anywhere in it (e.g. "-vf"
// trips "-f"), same tradeoff enforce-git-allowlist.sh's token_has_short_flag already accepts.
function hasShortFlag(token: string, letter: string): boolean {
  if (token.startsWith('--')) return false;
  return /^-[a-zA-Z]+$/.test(token) && token.slice(1).includes(letter);
}

function assertNoForbiddenFlags(command: string, args: readonly string[], rule: CommandRule): void {
  const longFlags = rule.forbidLongFlags ?? [];
  const shortFlags = rule.forbidShortFlags ?? [];
  for (const token of args) {
    if (longFlags.includes(token)) {
      throw new RailwayCommandValidationError(
        `railway ${command} with "${token}" is not in the list of operations this session may ` +
          'run without a human.',
      );
    }
    const shortHit = shortFlags.find((letter) => hasShortFlag(token, letter));
    if (shortHit) {
      throw new RailwayCommandValidationError(
        `railway ${command} with "${token}" (matches short flag -${shortHit}) is not in the ` +
          'list of operations this session may run without a human.',
      );
    }
  }
}

function assertRequireFlag(command: string, args: readonly string[], required: string): void {
  if (!args.includes(required)) {
    throw new RailwayCommandValidationError(
      `railway ${command} is only allowed with "${required}" in this session.`,
    );
  }
}

function assertRequireAnyFlag(
  command: string,
  args: readonly string[],
  flags: readonly string[],
): void {
  if (!args.some((token) => flags.includes(token))) {
    throw new RailwayCommandValidationError(
      `railway ${command} is only allowed in one of these forms in this session: ${flags.join(', ')}.`,
    );
  }
}

function assertNoForbiddenPrefix(command: string, args: readonly string[], prefix: string): void {
  const hit = args.find((token) => token.startsWith(prefix));
  if (hit) {
    throw new RailwayCommandValidationError(
      `railway ${command} with a token starting with "${prefix}" ("${hit}") is not in the list ` +
        'of operations this session may run without a human.',
    );
  }
}

function assertVerbRule(
  command: string,
  args: readonly string[],
  verbRule: NonNullable<CommandRule['verbRule']>,
): void {
  const verb = args[0];
  if (verb === undefined) {
    if (verbRule.bareAllowed) return;
    throw new RailwayCommandValidationError(
      `railway ${command} with no verb is not in the list of operations this session may run ` +
        'without a human.',
    );
  }
  if (verb.startsWith('-') && verbRule.flagImpliesAllowed) return;
  if (verbRule.allowedVerbs?.includes(verb)) return;
  throw new RailwayCommandValidationError(
    `railway ${command} ${verb} is not in the list of operations this session may run without a human.`,
  );
}

export function validateCommand(command: string, args: readonly string[], rule: CommandRule): void {
  assertNoForbiddenFlags(command, args, rule);
  if (rule.requireFlag) assertRequireFlag(command, args, rule.requireFlag);
  if (rule.requireAnyFlag && rule.requireAnyFlag.length > 0) {
    assertRequireAnyFlag(command, args, rule.requireAnyFlag);
  }
  if (rule.forbidTokenPrefix) assertNoForbiddenPrefix(command, args, rule.forbidTokenPrefix);
  if (rule.verbRule) assertVerbRule(command, args, rule.verbRule);
}
