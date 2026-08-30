// Covers delegate-reasoning end to end through the real MCP server process — API key injection as
// a Bearer token from .env, the missing-env-var error path, a non-200 upstream response, a
// response with no choices, and the scenario-preset resolution/override precedence this tool adds
// on top of the plain custom mode deepseek-infer already had. Same "spawn the real server, fake
// only the external driver" approach as test/e2e/safe-curl.test.ts (see
// test/fixtures/fake-undici.mjs).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTempEnvFile } from '../helpers/env-file.js';

const DEEPSEEK_FAKE_API_KEY = 'fake-deepseek-key';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CALL_TOOL_MJS = path.join(SERVER_ROOT, 'bin', 'call-tool.mjs');
const REGISTER_FAKE_DRIVERS = path.join(
  SERVER_ROOT,
  'test',
  'fixtures',
  'register-fake-drivers.mjs',
);

interface CallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function callDelegateReasoning(
  toolArguments: Record<string, unknown>,
  envOverrides: Record<string, string>,
): Promise<CallResult> {
  const { path: envFile, cleanup } = await writeTempEnvFile(envOverrides);
  try {
    return await new Promise<CallResult>((resolve, reject) => {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(REGISTER_FAKE_DRIVERS).href}`,
        CEM_MCP_ENV_FILE: envFile,
      };

      const child = spawn(process.execPath, [CALL_TOOL_MJS, 'delegate-reasoning'], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));

      child.stdin.write(JSON.stringify({ prompt: 'hello', ...toolArguments }));
      child.stdin.end();
    });
  } finally {
    await cleanup();
  }
}

describe('delegate-reasoning (via call-tool.mjs against the real MCP server)', () => {
  it('sends the prompt with the injected Bearer token and returns the response', async () => {
    const { stdout, exitCode } = await callDelegateReasoning(
      { prompt: 'hello' },
      { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.response).toBe('echo: hello');
    expect(payload.model).toBe('deepseek-chat');
    expect(payload.finishReason).toBe('stop');
    expect(payload.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it('defaults model to deepseek-chat when not given', async () => {
    const { stdout, exitCode } = await callDelegateReasoning(
      { prompt: 'hello' },
      { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).model).toBe('deepseek-chat');
  });

  it('sends the requested model through unchanged in custom mode', async () => {
    const { stdout, exitCode } = await callDelegateReasoning(
      { prompt: 'hello', model: 'deepseek-reasoner' },
      { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).model).toBe('deepseek-reasoner');
  });

  it('rejects when DEEPSEEK_API_KEY is not set, naming the var', async () => {
    const { stderr, exitCode } = await callDelegateReasoning({ prompt: 'hello' }, {});
    expect(exitCode).toBe(1);
    expect(stderr).toContain('DEEPSEEK_API_KEY');
  });

  it('surfaces a clear error when the credential is wrong (Deepseek returns 401)', async () => {
    const { stderr, exitCode } = await callDelegateReasoning(
      { prompt: 'hello' },
      { DEEPSEEK_API_KEY: 'wrong-key' },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('401');
  });

  it('surfaces a clear error when the response has no choices', async () => {
    const { stderr, exitCode } = await callDelegateReasoning(
      { prompt: 'trigger-empty-choices' },
      { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('no choices');
  });

  describe('scenario presets', () => {
    it('applies the "bulk-scan" preset systemPrompt/maxTokens/temperature when no overrides are given', async () => {
      const { stdout, exitCode } = await callDelegateReasoning(
        { prompt: 'hello', scenario: 'bulk-scan' },
        { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
      );
      expect(exitCode).toBe(0);
      const payload = JSON.parse(stdout);
      expect(payload.model).toBe('deepseek-chat');
      expect(payload.response).toContain('[system=You are a mechanical filter');
      expect(payload.response).toContain('[maxTokens=4096]');
      expect(payload.response).toContain('[temperature=0.1]');
    });

    it('applies the "extract-relevant" preset systemPrompt/maxTokens/temperature when no overrides are given', async () => {
      const { stdout, exitCode } = await callDelegateReasoning(
        { prompt: 'hello', scenario: 'extract-relevant' },
        { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
      );
      expect(exitCode).toBe(0);
      const payload = JSON.parse(stdout);
      expect(payload.response).toContain('[system=You are a precise extractor');
      expect(payload.response).toContain('[maxTokens=8192]');
      expect(payload.response).toContain('[temperature=0.1]');
    });

    it('lets an explicit override win over the scenario preset', async () => {
      const { stdout, exitCode } = await callDelegateReasoning(
        { prompt: 'hello', scenario: 'bulk-scan', temperature: 0.9, maxTokens: 256 },
        { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
      );
      expect(exitCode).toBe(0);
      const payload = JSON.parse(stdout);
      expect(payload.response).toContain('[maxTokens=256]');
      expect(payload.response).toContain('[temperature=0.9]');
    });

    it('rejects an unknown scenario, naming it, without calling the upstream API', async () => {
      const { stderr, exitCode } = await callDelegateReasoning(
        { prompt: 'hello', scenario: 'not-a-real-scenario' },
        { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('not-a-real-scenario');
    });
  });

  describe('outputFileName', () => {
    const toolOutputDir = path.join(SERVER_ROOT, '.tool-output', 'delegate-reasoning');

    afterEach(async () => {
      const { rm } = await import('node:fs/promises');
      await rm(toolOutputDir, { recursive: true, force: true });
    });

    it('writes the full result to disk and returns a summary with responseLength instead of response', async () => {
      const { stdout, exitCode } = await callDelegateReasoning(
        { prompt: 'hello', outputFileName: 'e2e-result.json' },
        { DEEPSEEK_API_KEY: DEEPSEEK_FAKE_API_KEY },
      );
      expect(exitCode).toBe(0);
      const summary = JSON.parse(stdout);
      expect(summary.written).toBe(true);
      expect(summary.response).toBeUndefined();
      expect(summary.responseLength).toBe('echo: hello'.length);
    });
  });
});
