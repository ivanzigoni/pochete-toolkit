import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { EnvConfig } from '../../shared/env-config.js';
import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../shared/tool-output.js';
import { resolveConnectionPassword, resolveConnectionProfile } from './connection-profiles.js';
import { resolveSafeQueryLimits } from './limits.js';
import { maskSensitiveColumns } from './mask.js';
import { runQuery } from './query.js';
import type { OutputPayload } from './types.js';
import { validateSelectOnly } from './validate.js';

const INPUT_SHAPE = {
  // No .min(1) here on purpose — an empty/whitespace-only query is rejected by
  // validateSelectOnly() below with a clearer, single-source-of-truth message ("query is empty")
  // instead of a raw Zod schema error.
  query: z.string(),
  connection: z
    .string()
    .min(1)
    .describe(
      'Which registered connection profile to query (see config.json). No default ' +
        '— always state it explicitly. An unregistered value returns an error listing the ' +
        'connections actually registered.',
    ),
  ...OUTPUT_FILE_SHAPE,
};

export function registerSafeQueryTool(server: McpServer): void {
  server.registerTool(
    'safe-query',
    {
      title: 'Run a read-only SQL query',
      description:
        'Runs a single read-only SELECT/WITH query against the named connection profile and ' +
        'returns the result as JSON. Write statements are rejected mechanically ' +
        '(string/comment-aware scanner, plus every query runs inside a transaction that is ' +
        'always rolled back) — not just by convention. Engine/host/port/database/user for each ' +
        "registered connection live in this server's own config.json; only the " +
        "password stays out of it, behind the env var that profile names in this server's own " +
        '.env. Query timeout and max row count are fixed server-side and shared across every ' +
        'connection, not caller-supplied.',
      inputSchema: INPUT_SHAPE,
    },
    async (input) => {
      try {
        const query = validateSelectOnly(input.query);
        const profile = resolveConnectionProfile(input.connection);
        const env = new EnvConfig('safe-query');
        const password = resolveConnectionPassword(input.connection, env);
        const { timeoutSeconds, maxRows } = resolveSafeQueryLimits(env);
        const connection = { ...profile, password, timeoutSeconds };

        const startedAt = Date.now();
        const result = await runQuery(connection, query);
        const durationMs = Date.now() - startedAt;

        const truncated = result.rows.length > maxRows;
        const rows = maskSensitiveColumns(
          result.fields,
          truncated ? result.rows.slice(0, maxRows) : result.rows,
        );

        const executedAt = new Date(startedAt).toISOString();
        const summary = {
          connection: input.connection,
          engine: connection.engine,
          host: connection.host,
          database: connection.database,
          executedAt,
          columns: result.fields,
          rowCount: rows.length,
          totalRowCount: result.rows.length,
          durationMs,
          truncated,
        };
        const payload: OutputPayload = { ...summary, rows };

        return await finalizeToolOutput({
          toolName: 'safe-query',
          payload,
          summary,
          outputFileName: input.outputFileName,
          outputDir: input.outputDir,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    },
  );
}
