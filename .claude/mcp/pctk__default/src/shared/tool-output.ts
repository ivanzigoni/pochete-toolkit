import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Every tool's full JSON result can optionally be written here instead of returned inline, for
// results large enough that inlining them would flood the caller's context. Fixed at this one
// root (not a caller-supplied absolute path) so outputFileName can never point a write outside
// this server's own directory tree — the file name is the only part the caller controls, and it
// is validated below to rule out path separators/traversal within that. outputDir (below) is a
// deliberately separate, unrestricted escape hatch — see its own description for why.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.join(moduleDir, '..', '..', '.tool-output');

const FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export const OUTPUT_FILE_SHAPE = {
  outputFileName: z
    .union([z.literal(true), z.string().regex(FILE_NAME_PATTERN)])
    .optional()
    .describe(
      "Write the full JSON result to a file under this server's own managed output directory " +
        'instead of returning it inline, and return a short summary plus the written path ' +
        'instead — use for results large enough to flood context if returned inline. Pass `true` ' +
        'for an auto-generated timestamped file name, or a plain file name (letters, digits, ' +
        "`.`, `_`, `-` only — no path separators). Omit entirely to get today's behavior: the " +
        'full JSON returned inline, nothing written to disk.',
    ),
  outputDir: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional directory to also write the full JSON result to, as ' +
        '<toolName>_<DD-MM-YYYY_HH-mm>.json (one new file per call, timestamped with the moment ' +
        'of emission — never overwritten), in addition to whatever this call already returns to ' +
        "the agent via outputFileName/inline. Resolved relative to the server process's working " +
        'directory when not absolute. Independent of outputFileName — passing outputDir does not ' +
        'change whether the agent gets the full payload or a summary. Unlike outputFileName, ' +
        "this path is caller-controlled and not confined to this server's managed output " +
        'directory: any path the caller/agent can construct is accepted as-is, by deliberate ' +
        'choice.',
    ),
};

export type OutputFileNameInput = true | string | undefined;

function resolveOutputPath(toolName: string, requested: true | string): string {
  const dir = path.join(OUTPUT_ROOT, toolName);
  const fileName =
    requested === true ? `${new Date().toISOString().replace(/[:.]/g, '-')}.json` : requested;
  return path.join(dir, fileName);
}

// DD-MM-YYYY_HH-mm — day-level precision is enough to tell calls apart across a rerun, and the
// hyphen/underscore separators keep the name valid across filesystems.
function formatEmissionTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}`
  );
}

function resolveOutputDirFileName(toolName: string, requested: string | undefined): string {
  const baseName = requested ?? `${toolName}.json`;
  const ext = path.extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  return `${stem}_${formatEmissionTimestamp(new Date())}${ext || '.json'}`;
}

export interface FinalizeToolOutputParams {
  toolName: string;
  payload: unknown;
  summary: Record<string, unknown>;
  outputFileName: OutputFileNameInput;
  outputDir?: string;
  /** Overrides the default `<toolName>` base name used when writing into outputDir (the emission
   * timestamp is still appended to it — see outputDirFileName in tool-output.ts). */
  outputDirFileName?: string;
}

/**
 * Shared success-path shaping for every tool on this server.
 *
 * outputDir, when present, always writes the full payload to
 * <outputDir>/<outputDirFileName ?? toolName>_<DD-MM-YYYY_HH-mm>.json first, regardless of
 * outputFileName — this is an unconditional side effect, not an alternative to the behavior
 * below. Each call gets its own timestamped file; nothing is overwritten.
 *
 * Then, for the response returned to the agent: with no outputFileName, behaves exactly like
 * every tool did before outputFileName existed (full payload inlined). With one, writes the full
 * payload to this server's own .tool-output/<toolName>/ directory and returns `summary` plus the
 * written path instead, so a large result doesn't get inlined into the caller's context.
 */
export async function finalizeToolOutput(
  params: FinalizeToolOutputParams,
): Promise<CallToolResult> {
  if (params.outputDir !== undefined) {
    const resolvedDir = path.resolve(params.outputDir);
    const fileName = resolveOutputDirFileName(params.toolName, params.outputDirFileName);
    await mkdir(resolvedDir, { recursive: true });
    await writeFile(path.join(resolvedDir, fileName), JSON.stringify(params.payload, null, 2));
  }

  if (params.outputFileName === undefined) {
    return { content: [{ type: 'text', text: JSON.stringify(params.payload, null, 2) }] };
  }

  const outputPath = resolveOutputPath(params.toolName, params.outputFileName);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(params.payload, null, 2));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ...params.summary, written: true, outputPath }, null, 2),
      },
    ],
  };
}
