/**
 * Applies a command-allowlist.json rule to a service+operation's args, and separately rejects any
 * attempt to set the AWS region/profile/endpoint scope from `args` — those come only from the
 * call's authProfile (see auth-profiles.ts) and are injected server-side in exec.ts, never
 * caller-supplied. Same "mechanical, not just convention" posture as
 * railway-safe-cli/validate.ts rejecting a project/environment/service override.
 *
 * `--endpoint-url` is blocked here even though it has no analogue in railway-safe-cli's own scope
 * flags: letting the caller redirect a call to an arbitrary endpoint would defeat the whole point
 * of fixing the account/region server-side (a caller-controlled endpoint is an exfiltration path
 * dressed up as a normal-looking flag).
 *
 * The rule shapes below (requireFlag, requireAnyFlag, forbidLongFlags, forbidShortFlags,
 * forbidTokenPrefix, verbRule) are the same engine railway-safe-cli/validate.ts already applies to
 * railway subcommands, reused unchanged here for aws service+operation pairs.
 */
import type { CommandRule } from './types.js';

export class AwsCommandValidationError extends Error {}

const SCOPE_FLAG_EXACT = new Set(['--region', '--profile', '--endpoint-url']);
const SCOPE_FLAG_PREFIXES = ['--region=', '--profile=', '--endpoint-url='];

export function assertNoScopeOverride(args: readonly string[]): void {
  const found = args.find(
    (token) =>
      SCOPE_FLAG_EXACT.has(token) || SCOPE_FLAG_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
  if (found) {
    throw new AwsCommandValidationError(
      `args must not set "${found}" — region/profile/endpoint are fixed by the call's ` +
        'authProfile, never caller-supplied. Remove it from args and retry.',
    );
  }
}

// Deliberately coarse — matches a single-dash cluster containing letter anywhere in it (e.g. "-vf"
// trips "-f"), same tradeoff railway-safe-cli/validate.ts's hasShortFlag already accepts.
function hasShortFlag(token: string, letter: string): boolean {
  if (token.startsWith('--')) return false;
  return /^-[a-zA-Z]+$/.test(token) && token.slice(1).includes(letter);
}

function assertNoForbiddenFlags(
  commandKey: string,
  args: readonly string[],
  rule: CommandRule,
): void {
  const longFlags = rule.forbidLongFlags ?? [];
  const shortFlags = rule.forbidShortFlags ?? [];
  for (const token of args) {
    if (longFlags.includes(token)) {
      throw new AwsCommandValidationError(
        `aws ${commandKey} with "${token}" is not in the list of operations this session may ` +
          'run without a human.',
      );
    }
    const shortHit = shortFlags.find((letter) => hasShortFlag(token, letter));
    if (shortHit) {
      throw new AwsCommandValidationError(
        `aws ${commandKey} with "${token}" (matches short flag -${shortHit}) is not in the ` +
          'list of operations this session may run without a human.',
      );
    }
  }
}

function assertRequireFlag(commandKey: string, args: readonly string[], required: string): void {
  if (!args.includes(required)) {
    throw new AwsCommandValidationError(
      `aws ${commandKey} is only allowed with "${required}" in this session.`,
    );
  }
}

function assertRequireAnyFlag(
  commandKey: string,
  args: readonly string[],
  flags: readonly string[],
): void {
  if (!args.some((token) => flags.includes(token))) {
    throw new AwsCommandValidationError(
      `aws ${commandKey} is only allowed in one of these forms in this session: ${flags.join(', ')}.`,
    );
  }
}

function assertNoForbiddenPrefix(
  commandKey: string,
  args: readonly string[],
  prefix: string,
): void {
  const hit = args.find((token) => token.startsWith(prefix));
  if (hit) {
    throw new AwsCommandValidationError(
      `aws ${commandKey} with a token starting with "${prefix}" ("${hit}") is not in the list ` +
        'of operations this session may run without a human.',
    );
  }
}

function assertVerbRule(
  commandKey: string,
  args: readonly string[],
  verbRule: NonNullable<CommandRule['verbRule']>,
): void {
  const verb = args[0];
  if (verb === undefined) {
    if (verbRule.bareAllowed) return;
    throw new AwsCommandValidationError(
      `aws ${commandKey} with no verb is not in the list of operations this session may run ` +
        'without a human.',
    );
  }
  if (verb.startsWith('-') && verbRule.flagImpliesAllowed) return;
  if (verbRule.allowedVerbs?.includes(verb)) return;
  throw new AwsCommandValidationError(
    `aws ${commandKey} ${verb} is not in the list of operations this session may run without a human.`,
  );
}

export function validateCommand(
  service: string,
  operation: string,
  args: readonly string[],
  rule: CommandRule,
): void {
  const commandKey = `${service} ${operation}`;
  assertNoForbiddenFlags(commandKey, args, rule);
  if (rule.requireFlag) assertRequireFlag(commandKey, args, rule.requireFlag);
  if (rule.requireAnyFlag && rule.requireAnyFlag.length > 0) {
    assertRequireAnyFlag(commandKey, args, rule.requireAnyFlag);
  }
  if (rule.forbidTokenPrefix) assertNoForbiddenPrefix(commandKey, args, rule.forbidTokenPrefix);
  if (rule.verbRule) assertVerbRule(commandKey, args, rule.verbRule);
}
