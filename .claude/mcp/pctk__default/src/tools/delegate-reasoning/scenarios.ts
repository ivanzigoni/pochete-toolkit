/**
 * Loads the registered reasoning scenarios from `scenarios.json` — the single source of truth for
 * which systemPrompt/model/maxTokens/temperature a given scenario preset resolves to. Unlike
 * auth-profiles.json (safe-curl, bitbucket-open-pr), this catalog holds no secret or
 * workspace-specific infra pointer — only prompt text and reasoning parameters — so it is a
 * normal versioned file, not gitignored.
 *
 * Read and validated at module load time, not lazily: same reasoning as auth-profiles.ts, the
 * registry's shape doesn't depend on dotenv having run, so there's no ordering hazard in using it
 * to build the tool's input schema (register.ts). Validated with zod even though it's a
 * repo-owned file — it crossed a process boundary (a file on disk), and a human can hand-edit it
 * into an invalid shape.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(moduleDir, 'scenarios.json');

const reasoningScenarioSchema = z.object({
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  model: z.enum(['deepseek-chat', 'deepseek-reasoner']).optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type ReasoningScenario = z.infer<typeof reasoningScenarioSchema>;

const SCENARIOS: Readonly<Record<string, ReasoningScenario>> = z
  .record(z.string(), reasoningScenarioSchema)
  .parse(JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')));

export const SCENARIO_IDS = Object.keys(SCENARIOS);

export function resolveScenario(id: string): ReasoningScenario {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    throw new Error(
      `unknown scenario "${id}" — registered scenarios: ${SCENARIO_IDS.join(', ')} (see scenarios.json)`,
    );
  }
  return scenario;
}

// Built once at module load for reuse in register.ts's own field descriptions, rather than each
// call site re-deriving the same "id: description" listing from SCENARIOS.
export const SCENARIO_CATALOG_SUMMARY = Object.entries(SCENARIOS)
  .map(([id, scenario]) => `"${id}" (${scenario.description})`)
  .join('; ');
