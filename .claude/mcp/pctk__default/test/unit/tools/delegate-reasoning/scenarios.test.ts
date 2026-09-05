import { describe, expect, it } from 'vitest';
import {
  resolveScenario,
  SCENARIO_CATALOG_SUMMARY,
  SCENARIO_IDS,
} from '../../../../src/tools/delegate-reasoning/scenarios.js';

describe('SCENARIO_IDS', () => {
  it('includes the "bulk-scan" and "extract-relevant" scenarios registered in scenarios.json', () => {
    expect(SCENARIO_IDS).toContain('bulk-scan');
    expect(SCENARIO_IDS).toContain('extract-relevant');
  });
});

describe('resolveScenario', () => {
  it('resolves "bulk-scan" to its preset systemPrompt/model/maxTokens/temperature', () => {
    const scenario = resolveScenario('bulk-scan');
    expect(scenario.model).toBe('deepseek-chat');
    expect(scenario.temperature).toBeCloseTo(0.1);
    expect(scenario.maxTokens).toBe(4096);
    expect(scenario.systemPrompt.length).toBeGreaterThan(0);
  });

  it('resolves "extract-relevant" to its preset systemPrompt/model/maxTokens/temperature', () => {
    const scenario = resolveScenario('extract-relevant');
    expect(scenario.model).toBe('deepseek-chat');
    expect(scenario.temperature).toBeCloseTo(0.1);
    expect(scenario.maxTokens).toBe(8192);
    expect(scenario.systemPrompt.length).toBeGreaterThan(0);
  });

  it('throws, naming the unknown id, for an unregistered scenario', () => {
    expect(() => resolveScenario('not-a-real-scenario')).toThrow(/not-a-real-scenario/);
  });
});

describe('SCENARIO_CATALOG_SUMMARY', () => {
  it('mentions every registered scenario id', () => {
    for (const id of SCENARIO_IDS) {
      expect(SCENARIO_CATALOG_SUMMARY).toContain(id);
    }
  });
});
