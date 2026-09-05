/**
 * Parses a pasted curl command (as copied from browser devtools' "Copy as cURL") into
 * `{ method, url, headers, body }`, without ever shelling out to a real shell or the real `curl`
 * binary — this is a small hand-written tokenizer plus a flag-by-flag reader, not a wrapper
 * around `sh -c`. That is what makes it safe to feed untrusted/pasted text straight in: there is
 * no interpreter here for a crafted value to escape out of.
 *
 * Deliberately supports only the flag set real browser-copied curls actually use (see
 * `VALUE_FLAG_EFFECT`/`IGNORED_FLAGS` below) — an unrecognized flag is a hard error, not a silent
 * skip, so a curl this parser mishandles fails loudly instead of quietly dropping a header or the
 * body.
 */
import type { ParsedCurlRequest } from './types.js';

export class CurlParseError extends Error {}

type TokenizerMode = 'normal' | 'single' | 'double';

interface TokenizerStep {
  readonly nextIndex: number;
  readonly append?: string;
  readonly mode?: TokenizerMode;
  readonly endToken?: boolean;
}

function stepInSingleQuote(input: string, i: number): TokenizerStep {
  const ch = input[i]!;
  if (ch === "'") return { nextIndex: i + 1, mode: 'normal' };
  return { nextIndex: i + 1, append: ch };
}

function stepInDoubleQuote(input: string, i: number): TokenizerStep {
  const ch = input[i]!;
  if (ch === '"') return { nextIndex: i + 1, mode: 'normal' };
  if (ch === '\\' && '"\\$`\n'.includes(input[i + 1] ?? '')) {
    return { nextIndex: i + 2, append: input[i + 1] };
  }
  return { nextIndex: i + 1, append: ch };
}

function stepInNormalMode(input: string, i: number): TokenizerStep {
  const ch = input[i]!;
  if (ch === "'") return { nextIndex: i + 1, mode: 'single' };
  if (ch === '"') return { nextIndex: i + 1, mode: 'double' };
  if (ch === '\\' && input[i + 1] !== undefined) {
    return { nextIndex: i + 2, append: input[i + 1] };
  }
  if (ch === '\\') return { nextIndex: i + 1 };
  if (/\s/.test(ch)) return { nextIndex: i + 1, endToken: true };
  return { nextIndex: i + 1, append: ch };
}

function stepTokenizer(input: string, i: number, mode: TokenizerMode): TokenizerStep {
  if (mode === 'single') return stepInSingleQuote(input, i);
  if (mode === 'double') return stepInDoubleQuote(input, i);
  return stepInNormalMode(input, i);
}

/**
 * Shell-word tokenizer covering exactly the quoting rules a copy-pasted curl actually uses:
 * single-quoted (literal, no escapes), double-quoted (`\` escapes `" \ $ backtick newline`), and
 * unquoted words (`\` escapes the next character). A `\<newline>` line continuation (the standard
 * "curl \<newline>  -H ..." shape) is stripped up front, everywhere in the input — real curls
 * never carry a literal backslash-newline inside a quoted value, so this simplification is safe
 * in practice while keeping the character-by-character state machine below to just three modes.
 */
export function tokenizeCurlCommand(rawInput: string): string[] {
  const input = rawInput.replace(/\\\r?\n/g, ' ');
  const tokens: string[] = [];
  let current = '';
  let hasCurrent = false;
  let mode: TokenizerMode = 'normal';
  let i = 0;

  while (i < input.length) {
    const step = stepTokenizer(input, i, mode);
    i = step.nextIndex;

    if (step.mode) {
      mode = step.mode;
      if (mode !== 'normal') hasCurrent = true;
    }
    if (step.append !== undefined) {
      current += step.append;
      hasCurrent = true;
    }
    if (step.endToken && hasCurrent) {
      tokens.push(current);
      current = '';
      hasCurrent = false;
    }
  }

  if (mode !== 'normal') {
    throw new CurlParseError('unterminated quote in curl command');
  }
  if (hasCurrent) tokens.push(current);

  return tokens;
}

type FlagEffect =
  | { readonly kind: 'method'; readonly value: string }
  | { readonly kind: 'header'; readonly name: string; readonly value: string }
  | { readonly kind: 'data'; readonly value: string }
  | { readonly kind: 'reject'; readonly message: string };

function parseHeaderLine(headerLine: string): { name: string; value: string } {
  const sep = headerLine.indexOf(':');
  if (sep === -1) {
    throw new CurlParseError(`malformed -H value (expected "Name: value"): ${headerLine}`);
  }
  const name = headerLine.slice(0, sep).trim();
  const value = headerLine.slice(sep + 1).trim();
  if (!name) {
    throw new CurlParseError(`malformed -H value (empty header name): ${headerLine}`);
  }
  return { name, value };
}

const REJECT_BASIC_AUTH: FlagEffect = {
  kind: 'reject',
  message:
    '-u/--user (basic auth) is not supported — this tool only injects credentials from the ' +
    "authProfile's own env var in this server's .env, never via a value in the curl itself.",
};

// Every value-taking flag real browser-copied curls use, mapped to how its value shapes the
// request. An unrecognized flag is a hard parse error (see readFlag) rather than a silent skip.
const VALUE_FLAG_EFFECT: Record<string, (value: string) => FlagEffect> = {
  '-X': (value) => ({ kind: 'method', value }),
  '--request': (value) => ({ kind: 'method', value }),
  '-H': (value) => ({ kind: 'header', ...parseHeaderLine(value) }),
  '--header': (value) => ({ kind: 'header', ...parseHeaderLine(value) }),
  '-b': (value) => ({ kind: 'header', name: 'Cookie', value }),
  '--cookie': (value) => ({ kind: 'header', name: 'Cookie', value }),
  '-d': (value) => ({ kind: 'data', value }),
  '--data': (value) => ({ kind: 'data', value }),
  '--data-raw': (value) => ({ kind: 'data', value }),
  '--data-binary': (value) => ({ kind: 'data', value }),
  '--data-ascii': (value) => ({ kind: 'data', value }),
  '-A': (value) => ({ kind: 'header', name: 'User-Agent', value }),
  '--user-agent': (value) => ({ kind: 'header', name: 'User-Agent', value }),
  '-e': (value) => ({ kind: 'header', name: 'Referer', value }),
  '--referer': (value) => ({ kind: 'header', name: 'Referer', value }),
  '-u': () => REJECT_BASIC_AUTH,
  '--user': () => REJECT_BASIC_AUTH,
};

// Flags real browser-copied curls include that carry no request-shaping information for our
// purposes — recognized and skipped rather than rejected as unsupported.
const IGNORED_FLAGS = new Set([
  '--compressed',
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-i',
  '--include',
  '-k',
  '--insecure',
  '-L',
  '--location',
  '-v',
  '--verbose',
]);

type FlagReadResult =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'positional' }
  | { readonly kind: 'effect'; readonly consumed: number; readonly effect: FlagEffect };

function readFlag(tokens: readonly string[], idx: number): FlagReadResult {
  const token = tokens[idx]!;

  if (IGNORED_FLAGS.has(token)) return { kind: 'ignored' };

  const effectFn = VALUE_FLAG_EFFECT[token];
  if (effectFn) {
    const value = tokens[idx + 1];
    if (value === undefined) {
      throw new CurlParseError(`${token} requires a value`);
    }
    return { kind: 'effect', consumed: 2, effect: effectFn(value) };
  }

  if (!token.startsWith('-')) return { kind: 'positional' };

  throw new CurlParseError(`unsupported curl flag: ${token}`);
}

interface LoopEffect {
  readonly consumed: number;
  readonly url?: string;
  readonly method?: string;
  readonly header?: { readonly name: string; readonly value: string };
  readonly data?: string;
}

// Resolves what one loop iteration does to the accumulated request — kept separate from
// parseCurlCommand's own loop so that loop stays a flat sequence of field assignments instead of
// nested branching, which is what keeps its cognitive complexity low.
function resolveLoopEffect(
  tokens: readonly string[],
  idx: number,
  currentUrl: string | undefined,
): LoopEffect {
  const token = tokens[idx]!;
  const result = readFlag(tokens, idx);

  if (result.kind === 'ignored') {
    return { consumed: 1 };
  }
  if (result.kind === 'positional') {
    if (currentUrl !== undefined) {
      throw new CurlParseError(`multiple URL-like arguments found: ${currentUrl} and ${token}`);
    }
    return { consumed: 1, url: token };
  }

  const { effect } = result;
  if (effect.kind === 'reject') {
    throw new CurlParseError(effect.message);
  }
  if (effect.kind === 'method') {
    return { consumed: result.consumed, method: effect.value };
  }
  if (effect.kind === 'header') {
    return { consumed: result.consumed, header: { name: effect.name, value: effect.value } };
  }
  return { consumed: result.consumed, data: effect.value };
}

/** Parses a pasted curl command into method/url/headers/body. Throws {@link CurlParseError}. */
export function parseCurlCommand(raw: string): ParsedCurlRequest {
  const tokens = tokenizeCurlCommand(raw.trim());
  if (tokens.length === 0) {
    throw new CurlParseError('curl command is empty');
  }

  const startIdx = tokens[0]?.toLowerCase() === 'curl' ? 1 : 0;

  let method: string | undefined;
  let url: string | undefined;
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];

  let idx = startIdx;
  while (idx < tokens.length) {
    const loopEffect = resolveLoopEffect(tokens, idx, url);
    idx += loopEffect.consumed;
    if (loopEffect.url !== undefined) url = loopEffect.url;
    if (loopEffect.method !== undefined) method = loopEffect.method;
    if (loopEffect.header) headers[loopEffect.header.name] = loopEffect.header.value;
    if (loopEffect.data !== undefined) dataParts.push(loopEffect.data);
  }

  if (!url) {
    throw new CurlParseError('no URL found in curl command');
  }

  const resolvedMethod = (method ?? (dataParts.length > 0 ? 'POST' : 'GET')).toUpperCase();
  const body = dataParts.length > 0 ? dataParts.join('&') : undefined;

  return { method: resolvedMethod, url, headers, body };
}
