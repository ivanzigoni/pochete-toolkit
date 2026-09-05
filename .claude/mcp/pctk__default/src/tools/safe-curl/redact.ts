/**
 * Masks response headers that could carry a real credential back to the caller — unlike every
 * other tool on this server, safe-curl's payload comes from an arbitrary external HTTP
 * response, so a header the target API sets (Set-Cookie granting a new session, an echoed auth
 * token, ...) is not something this tool's own input validation controls. Applied to both the
 * inline MCP response and whatever gets written to disk via outputFileName — never only one of
 * the two.
 */

const EXACT_REDACTED_HEADER_NAMES = new Set(['set-cookie', 'www-authenticate', 'proxy-authenticate']);
const REDACTED_HEADER_SUBSTRINGS = ['auth', 'token'];

const REDACTED_VALUE = '[REDACTED]';

function isSensitiveHeaderName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    EXACT_REDACTED_HEADER_NAMES.has(lower) ||
    REDACTED_HEADER_SUBSTRINGS.some((substring) => lower.includes(substring))
  );
}

export function redactSensitiveHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = isSensitiveHeaderName(name) ? REDACTED_VALUE : value;
  }
  return redacted;
}
