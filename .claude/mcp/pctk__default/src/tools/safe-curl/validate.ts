/**
 * Mechanically rejects a parsed curl request that carries its own Cookie or Authorization header,
 * or its own copy of whatever header the call's authProfile injects (e.g. "X-API-Key" for a
 * profile whose `headerName` isn't the "Cookie" default) — not just by convention. `safe-curl`
 * exists specifically so that value never has to be pasted into a curl command at all; it is
 * injected server-side from the env var registered for the call's `authProfile` (see
 * `auth-profiles.ts`), read fresh at request time. Same "mechanical, not just convention" posture
 * as safe-query's validate.ts rejecting write statements.
 */

const BASE_FORBIDDEN_HEADER_NAMES = new Set(['cookie', 'authorization']);

export class CurlValidationError extends Error {}

export function assertNoInlineAuthHeaders(
  headers: Readonly<Record<string, string>>,
  injectedHeaderName: string = 'Cookie',
): void {
  const forbidden = new Set(BASE_FORBIDDEN_HEADER_NAMES);
  forbidden.add(injectedHeaderName.toLowerCase());
  const found = Object.keys(headers).find((name) => forbidden.has(name.toLowerCase()));
  if (found) {
    throw new CurlValidationError(
      `the curl command must not set its own "${found}" header — safe-curl injects that from ` +
        "the authProfile's env var instead; remove it from the pasted curl and retry.",
    );
  }
}
