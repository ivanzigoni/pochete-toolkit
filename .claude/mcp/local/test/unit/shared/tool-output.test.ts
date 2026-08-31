import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';

import { finalizeToolOutput, OUTPUT_FILE_SHAPE } from '../../../src/shared/tool-output.js';

const outputFileNameSchema = z.object(OUTPUT_FILE_SHAPE).shape.outputFileName;

describe('OUTPUT_FILE_SHAPE.outputFileName', () => {
  it('accepts omission (the default: no write)', () => {
    expect(outputFileNameSchema.safeParse(undefined).success).toBe(true);
  });

  it('accepts the literal true', () => {
    expect(outputFileNameSchema.safeParse(true).success).toBe(true);
  });

  it('accepts a plain file name', () => {
    expect(outputFileNameSchema.safeParse('report.json').success).toBe(true);
  });

  it('rejects a path with a directory separator', () => {
    expect(outputFileNameSchema.safeParse('../escape.json').success).toBe(false);
    expect(outputFileNameSchema.safeParse('sub/dir.json').success).toBe(false);
  });

  it('rejects false', () => {
    expect(outputFileNameSchema.safeParse(false).success).toBe(false);
  });
});

// This tool name is unique to this suite so its cleanup below can never race with another test
// file writing under .tool-output/ at the same time.
const TEST_TOOL_NAME = 'tool-output-test-fixture';

describe('finalizeToolOutput', () => {
  it('returns the full payload inline when outputFileName is omitted (no write to disk)', async () => {
    const result = await finalizeToolOutput({
      toolName: TEST_TOOL_NAME,
      payload: { rows: [1, 2, 3] },
      summary: { rowCount: 3 },
      outputFileName: undefined,
    });

    const content = result.content as { type: string; text: string }[];
    expect(JSON.parse(content[0]!.text)).toEqual({ rows: [1, 2, 3] });
  });

  describe('when a file is requested', () => {
    let toolOutputDir: string | undefined;

    afterEach(async () => {
      if (toolOutputDir !== undefined) await rm(toolOutputDir, { recursive: true, force: true });
      toolOutputDir = undefined;
    });

    it('writes the full payload to disk and returns the summary plus the path instead', async () => {
      const result = await finalizeToolOutput({
        toolName: TEST_TOOL_NAME,
        payload: { rows: [1, 2, 3], rowCount: 3 },
        summary: { rowCount: 3 },
        outputFileName: 'my-result.json',
      });

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]!.text) as {
        rowCount: number;
        written: boolean;
        outputPath: string;
      };
      expect(parsed.rowCount).toBe(3);
      expect(parsed.written).toBe(true);
      expect(parsed.outputPath.endsWith(path.join(TEST_TOOL_NAME, 'my-result.json'))).toBe(true);
      expect(parsed).not.toHaveProperty('rows');

      const fileContents = JSON.parse(await readFile(parsed.outputPath, 'utf8'));
      expect(fileContents).toEqual({ rows: [1, 2, 3], rowCount: 3 });

      toolOutputDir = path.dirname(parsed.outputPath);
    });

    it('auto-generates a timestamped file name when outputFileName is true', async () => {
      const result = await finalizeToolOutput({
        toolName: TEST_TOOL_NAME,
        payload: { ok: true },
        summary: {},
        outputFileName: true,
      });

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]!.text) as { outputPath: string };
      expect(path.basename(parsed.outputPath)).toMatch(/\.json$/);
      expect(path.dirname(parsed.outputPath).endsWith(TEST_TOOL_NAME)).toBe(true);

      toolOutputDir = path.dirname(parsed.outputPath);
    });
  });
});
