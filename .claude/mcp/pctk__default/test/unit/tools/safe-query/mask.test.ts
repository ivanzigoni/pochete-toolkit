import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { maskSensitiveColumns } from '../../../../src/tools/safe-query/mask.js';
import { writeTempJsonFile } from '../../../helpers/json-file.js';

// maskSensitiveColumns reads the real config.json's "maskColumns" section directly (no
// registry-as-parameter pure variant exists, since the column lists are the whole point of this
// module) — point POCHETE_SAFE_QUERY_CONFIG_FILE at a fixture for the whole file, mirroring the
// "partial"/"full" LGPD categories documented in config.example.json.
const CONFIG_FILE_VAR = 'POCHETE_SAFE_QUERY_CONFIG_FILE';
const originalConfigFileVar = process.env[CONFIG_FILE_VAR];
let cleanupConfigFile: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const { path: configPath, cleanup } = await writeTempJsonFile('config.json', {
    connections: {},
    maskColumns: {
      partial: ['cpf', 'datanascimento', 'nome'],
      full: ['religiao', 'senha', 'codreligiao'],
    },
  });
  cleanupConfigFile = cleanup;
  process.env[CONFIG_FILE_VAR] = configPath;
});

afterAll(async () => {
  if (originalConfigFileVar === undefined) delete process.env[CONFIG_FILE_VAR];
  else process.env[CONFIG_FILE_VAR] = originalConfigFileVar;
  await cleanupConfigFile?.();
});

describe('maskSensitiveColumns', () => {
  it('leaves columns that are not on the LGPD list untouched', () => {
    const rows = maskSensitiveColumns(['id', 'status'], [{ id: 1, status: 'ativo' }]);
    expect(rows).toEqual([{ id: 1, status: 'ativo' }]);
  });

  it('partially masks a direct-identifier column, keeping the first 2 characters', () => {
    const rows = maskSensitiveColumns(['CPF'], [{ CPF: '12345678900' }]);
    expect(rows).toEqual([{ CPF: '12***' }]);
  });

  it('matches column names case-insensitively', () => {
    const rows = maskSensitiveColumns(['cpf'], [{ cpf: '12345678900' }]);
    expect(rows).toEqual([{ cpf: '12***' }]);
  });

  it('fully masks a sensitive-category column, revealing nothing of the value', () => {
    const rows = maskSensitiveColumns(['Religiao'], [{ Religiao: 'Catolica' }]);
    expect(rows).toEqual([{ Religiao: '***' }]);
  });

  it('fully masks a credential column', () => {
    const rows = maskSensitiveColumns(['Senha'], [{ Senha: 'hunter2' }]);
    expect(rows).toEqual([{ Senha: '***' }]);
  });

  it('passes null and undefined through unchanged for both mask types', () => {
    const rows = maskSensitiveColumns(
      ['CPF', 'Religiao'],
      [{ CPF: null, Religiao: undefined }],
    );
    expect(rows).toEqual([{ CPF: null, Religiao: undefined }]);
  });

  it('masks a Date value by its ISO string representation', () => {
    const rows = maskSensitiveColumns(
      ['DataNascimento'],
      [{ DataNascimento: new Date('1990-05-20T00:00:00.000Z') }],
    );
    expect(rows).toEqual([{ DataNascimento: '19***' }]);
  });

  it('masks a numeric value by coercing it to a string first', () => {
    const rows = maskSensitiveColumns(['CodReligiao'], [{ CodReligiao: 7 }]);
    expect(rows).toEqual([{ CodReligiao: '***' }]);
  });

  it('masks every matching row independently', () => {
    const rows = maskSensitiveColumns(
      ['Nome'],
      [{ Nome: 'Maria Silva' }, { Nome: 'Joao Souza' }],
    );
    expect(rows).toEqual([{ Nome: 'Ma***' }, { Nome: 'Jo***' }]);
  });

  it('does not mutate the input rows', () => {
    const input = [{ CPF: '12345678900' }];
    const rows = maskSensitiveColumns(['CPF'], input);
    expect(input).toEqual([{ CPF: '12345678900' }]);
    expect(rows).not.toBe(input);
  });

  it('returns a fresh array (not the same reference) when no column matches', () => {
    const input = [{ id: 1 }];
    const rows = maskSensitiveColumns(['id'], input);
    expect(rows).toEqual(input);
    expect(rows).not.toBe(input);
  });
});
