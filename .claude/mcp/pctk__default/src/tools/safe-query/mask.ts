/**
 * Lightweight LGPD masking layer applied to `safe-query` results before they leave this server.
 * Matches purely by result column name (case-insensitive) — the tool accepts arbitrary read-only
 * SQL (joins, aliases, computed columns), so there is no reliable way to trace a returned column
 * back to its source table without a full SQL parser. This module carries no domain knowledge of
 * its own: the column-name lists live in this tool's own config.json (`maskColumns`, see
 * config.ts), curated per project by inventorying the DB tables actually read by that project's
 * services and classifying their columns against LGPD personal/sensitive-data categories. A name
 * match is intentionally global (any table), not scoped to specific tables, since e.g. `CPF` is
 * sensitive regardless of which table it came from.
 */
import { loadConfig } from './config.js';

export type MaskType = 'partial' | 'full';

/**
 * `partial`: direct identifiers, names, contact/address, financial account/card, and birth-date
 * columns — a light mask keeps the first 2 characters and replaces the rest with a fixed `***`
 * (the original length is deliberately not preserved, so it can't be inferred from the masked
 * value). `full`: LGPD art. 5º II sensitive categories (health, race/color, religion, sex/gender),
 * credentials, biometric/signature references, and free-text notes — no partial reveal is safe
 * for these, so the whole value is replaced with `***`.
 *
 * Read fresh on every call, never at module load time — a missing config.json degrades to
 * "nothing masked" for this call rather than crashing the shared MCP server on import. See
 * config.ts / shared/json-registry.ts.
 */
function buildMaskTypeByColumn(): ReadonlyMap<string, MaskType> {
  const { partial, full } = loadConfig().maskColumns;
  return new Map([
    ...partial.map((name): [string, MaskType] => [name, 'partial']),
    ...full.map((name): [string, MaskType] => [name, 'full']),
  ]);
}

const PARTIAL_MASK_PREFIX_LENGTH = 2;
const MASK_PLACEHOLDER = '***';

function maskValue(value: unknown, maskType: MaskType): unknown {
  if (value === null || value === undefined) return value;
  if (maskType === 'full') return MASK_PLACEHOLDER;

  const asString = value instanceof Date ? value.toISOString() : String(value);
  return asString.slice(0, PARTIAL_MASK_PREFIX_LENGTH) + MASK_PLACEHOLDER;
}

/**
 * Returns a new rows array with every column whose name (case-insensitive) matches the LGPD list
 * masked in every row. Columns not in the list, and null/undefined values, pass through unchanged.
 * `fields` should be the result set's own column list (e.g. `QueryResult.fields`) so the lookup
 * happens once per column instead of once per cell.
 */
export function maskSensitiveColumns(
  fields: readonly string[],
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const maskTypeByColumn = buildMaskTypeByColumn();
  const columnsToMask = fields
    .map((field) => [field, maskTypeByColumn.get(field.toLowerCase())] as const)
    .filter((entry): entry is [string, MaskType] => entry[1] !== undefined);

  if (columnsToMask.length === 0) return rows.slice();

  return rows.map((row) => {
    const maskedRow = { ...row };
    for (const [field, maskType] of columnsToMask) {
      maskedRow[field] = maskValue(maskedRow[field], maskType);
    }
    return maskedRow;
  });
}
