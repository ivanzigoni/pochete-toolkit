/**
 * SQL validation: masks the contents of string/identifier literals and comments (replacing them
 * with placeholder characters, same length, same positions) so that semicolon-splitting and
 * keyword-scanning only ever see real SQL syntax, never text that merely *looks* like SQL inside
 * a quoted value or a comment. This is what makes the keyword blocklist below safe to apply with
 * plain word-boundary regexes instead of a full SQL parser.
 *
 * Each construct below (`'...'`, `"..."`, `[...]`, `-- ...`, `/* ... *\/`) is masked by its own
 * small "consume" function rather than one large branching loop — keeps each function's
 * cyclomatic/cognitive complexity low and avoids `continue`/`break`-heavy control flow, while the
 * character-by-character semantics (including unterminated-literal handling) are unchanged.
 */

interface Consumed {
  readonly text: string;
  readonly next: number;
}

/** Single-quoted string literal; `''` is an escaped quote. Unterminated input masks to the end. */
function consumeSingleQuoted(query: string, start: number): Consumed | null {
  if (query[start] !== "'") return null;

  let i = start + 1;
  let out = 'x';
  while (i < query.length) {
    if (query[i] === "'" && query[i + 1] === "'") {
      out += 'xx';
      i += 2;
    } else if (query[i] === "'") {
      out += 'x';
      i += 1;
      return { text: out, next: i };
    } else {
      out += 'x';
      i += 1;
    }
  }
  return { text: out, next: i };
}

/** Double-quoted delimited identifier; `""` is an escaped quote. Same shape as single-quoted. */
function consumeDoubleQuoted(query: string, start: number): Consumed | null {
  if (query[start] !== '"') return null;

  let i = start + 1;
  let out = 'x';
  while (i < query.length) {
    if (query[i] === '"' && query[i + 1] === '"') {
      out += 'xx';
      i += 2;
    } else if (query[i] === '"') {
      out += 'x';
      i += 1;
      return { text: out, next: i };
    } else {
      out += 'x';
      i += 1;
    }
  }
  return { text: out, next: i };
}

/** MSSQL `[bracket identifier]`. */
function consumeBracketIdentifier(query: string, start: number): Consumed | null {
  if (query[start] !== '[') return null;

  let i = start + 1;
  let out = 'x';
  while (i < query.length && query[i] !== ']') {
    out += 'x';
    i += 1;
  }
  if (i < query.length) {
    out += 'x';
    i += 1;
  }
  return { text: out, next: i };
}

/** `-- line comment`; stops at (but does not consume) the newline. */
function consumeLineComment(query: string, start: number): Consumed | null {
  if (!(query[start] === '-' && query[start + 1] === '-')) return null;

  let i = start;
  let out = '';
  while (i < query.length && query[i] !== '\n') {
    out += ' ';
    i += 1;
  }
  return { text: out, next: i };
}

/** `/* block comment *\/` (non-nested). */
function consumeBlockComment(query: string, start: number): Consumed | null {
  if (!(query[start] === '/' && query[start + 1] === '*')) return null;

  let i = start + 2;
  let out = '  ';
  while (i < query.length && !(query[i] === '*' && query[i + 1] === '/')) {
    out += ' ';
    i += 1;
  }
  if (i < query.length) {
    out += '  ';
    i += 2;
  }
  return { text: out, next: i };
}

const CONSUMERS: readonly ((query: string, start: number) => Consumed | null)[] = [
  consumeSingleQuoted,
  consumeDoubleQuoted,
  consumeBracketIdentifier,
  consumeLineComment,
  consumeBlockComment,
];

/** Tries each consumer in turn; a plain loop (not a per-iteration closure) so it stays safe to
 * call from inside `maskQuery`'s own loop without tripping `no-loop-func`. */
function findConsumed(query: string, start: number): Consumed | null {
  for (let c = 0; c < CONSUMERS.length; c += 1) {
    const result = CONSUMERS[c]!(query, start);
    if (result) return result;
  }
  return null;
}

/** Replaces every character inside string/identifier literals and comments with a placeholder. */
export function maskQuery(query: string): string {
  let out = '';
  let i = 0;

  while (i < query.length) {
    const consumed = findConsumed(query, i);

    if (consumed) {
      out += consumed.text;
      i = consumed.next;
    } else {
      out += query[i];
      i += 1;
    }
  }

  return out;
}

/** Splits on top-level semicolons found in the masked text, returning trimmed non-empty parts of the original. */
export function splitStatements(original: string, masked: string): string[] {
  const parts: string[] = [];
  let start = 0;

  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] === ';') {
      parts.push(original.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(original.slice(start));

  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'CALL',
  'COPY',
  'VACUUM',
  'REINDEX',
  'ANALYZE',
  'LOCK',
  'SET',
  'INTO',
  'ATTACH',
  'DETACH',
  'REPLACE',
  'UPSERT',
  'BACKUP',
  'RESTORE',
  'SHUTDOWN',
  'KILL',
  'DBCC',
  'OPENROWSET',
  'OPENQUERY',
  'BULK',
  'DENY',
] as const;
const FORBIDDEN_KEYWORD_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`, 'i');

const DANGEROUS_FN_RES: readonly RegExp[] = [
  /\bxp_\w+/i,
  /\bsp_\w+/i,
  /\bpg_terminate_backend\b/i,
  /\bpg_cancel_backend\b/i,
  /\bpg_reload_conf\b/i,
  /\bpg_read_file\b/i,
  /\bpg_read_binary_file\b/i,
  /\bpg_ls_dir\b/i,
  /\blo_import\b/i,
  /\blo_export\b/i,
  /\bdblink\w*\b/i,
  /\bpg_sleep\b/i,
];

export class QueryValidationError extends Error {}

function assertQueryIsUsableText(rawQuery: string): void {
  if (typeof rawQuery !== 'string' || rawQuery.includes('\0')) {
    throw new QueryValidationError('query is empty or contains invalid characters');
  }
  if (!rawQuery.trim()) {
    throw new QueryValidationError('query is empty');
  }
}

function extractSingleStatement(rawQuery: string): string {
  const masked = maskQuery(rawQuery);
  const statements = splitStatements(rawQuery, masked);
  if (statements.length !== 1) {
    throw new QueryValidationError(
      `exactly one SQL statement is allowed, found ${statements.length}`,
    );
  }
  return statements[0]!;
}

function assertSelectOnly(maskedStmt: string): void {
  if (!/^(SELECT|WITH)\b/i.test(maskedStmt)) {
    throw new QueryValidationError('only SELECT (or WITH ... SELECT) statements are allowed');
  }
}

function assertNoForbiddenKeyword(maskedStmt: string): void {
  const kwMatch = FORBIDDEN_KEYWORD_RE.exec(maskedStmt);
  if (kwMatch) {
    throw new QueryValidationError(`disallowed keyword detected: ${kwMatch[1]!.toUpperCase()}`);
  }
}

function assertNoDangerousFunction(maskedStmt: string): void {
  const matched = DANGEROUS_FN_RES.find((re) => re.test(maskedStmt));
  if (matched) {
    throw new QueryValidationError(`disallowed function reference detected (matches ${matched})`);
  }
}

/**
 * Validates that `rawQuery` is exactly one SELECT/WITH statement with no forbidden keyword or
 * dangerous function reference, and returns it (original text, comments intact). Throws
 * {@link QueryValidationError} otherwise.
 */
export function validateSelectOnly(rawQuery: string): string {
  assertQueryIsUsableText(rawQuery);

  const stmt = extractSingleStatement(rawQuery);
  const maskedStmt = maskQuery(stmt).trim();

  assertSelectOnly(maskedStmt);
  assertNoForbiddenKeyword(maskedStmt);
  assertNoDangerousFunction(maskedStmt);

  return stmt;
}
