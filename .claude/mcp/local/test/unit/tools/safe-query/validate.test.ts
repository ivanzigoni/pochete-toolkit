import { describe, expect, it } from 'vitest';
import {
  maskQuery,
  QueryValidationError,
  splitStatements,
  validateSelectOnly,
} from '../../../../src/tools/safe-query/validate.js';

describe('maskQuery', () => {
  it('masks a single-quoted string literal, preserving length', () => {
    expect(maskQuery("SELECT 'hello' AS greeting")).toBe('SELECT xxxxxxx AS greeting');
  });

  it('treats a doubled single quote as an escaped quote inside the literal', () => {
    expect(maskQuery("SELECT 'it''s' AS x")).toBe('SELECT xxxxxxx AS x');
  });

  it('masks an unterminated single-quoted literal to the end of the string', () => {
    expect(maskQuery("SELECT 'unterminated")).toBe('SELECT xxxxxxxxxxxxx');
  });

  it('masks a double-quoted identifier', () => {
    expect(maskQuery('SELECT "my col" FROM t')).toBe('SELECT xxxxxxxx FROM t');
  });

  it('treats a doubled double quote as an escaped quote inside the identifier', () => {
    expect(maskQuery('SELECT "my ""col""" FROM t')).toBe('SELECT xxxxxxxxxxxx FROM t');
  });

  it('masks an unterminated double-quoted identifier to the end of the string', () => {
    expect(maskQuery('SELECT "unterminated')).toBe('SELECT xxxxxxxxxxxxx');
  });

  it('masks a bracketed MSSQL identifier', () => {
    expect(maskQuery('SELECT [my col] FROM t')).toBe('SELECT xxxxxxxx FROM t');
  });

  it('masks a line comment up to but not including the newline', () => {
    const comment = '-- DELETE FROM t';
    const input = `SELECT 1 ${comment}\nFROM x`;
    const expected = `SELECT 1 ${' '.repeat(comment.length)}\nFROM x`;
    expect(maskQuery(input)).toBe(expected);
  });

  it('masks a block comment, including a multi-line one', () => {
    const masked = maskQuery('SELECT 1 /* DELETE FROM t */ FROM x');
    expect(masked).not.toContain('DELETE');
    expect(masked).toHaveLength('SELECT 1 /* DELETE FROM t */ FROM x'.length);
  });

  it('leaves an unquoted keyword outside any literal or comment untouched', () => {
    expect(maskQuery('SELECT * FROM t')).toBe('SELECT * FROM t');
  });
});

describe('splitStatements', () => {
  it('returns the whole trimmed input as one statement when there is no top-level semicolon', () => {
    const original = '  SELECT 1  ';
    expect(splitStatements(original, maskQuery(original))).toEqual(['SELECT 1']);
  });

  it('splits on a top-level semicolon into two statements', () => {
    const original = 'SELECT 1; SELECT 2';
    expect(splitStatements(original, maskQuery(original))).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('does not split on a semicolon that lives inside a masked string literal', () => {
    const original = "SELECT ';' AS x";
    expect(splitStatements(original, maskQuery(original))).toEqual(["SELECT ';' AS x"]);
  });

  it('drops empty statements produced by a trailing semicolon', () => {
    const original = 'SELECT 1;';
    expect(splitStatements(original, maskQuery(original))).toEqual(['SELECT 1']);
  });
});

describe('validateSelectOnly', () => {
  it('accepts a plain SELECT statement and returns it unchanged', () => {
    expect(validateSelectOnly('SELECT 1')).toBe('SELECT 1');
  });

  it('accepts a WITH ... SELECT statement', () => {
    const query = 'WITH cte AS (SELECT 1 AS x) SELECT * FROM cte';
    expect(validateSelectOnly(query)).toBe(query);
  });

  it('is case-insensitive for the leading keyword', () => {
    expect(validateSelectOnly('select 1')).toBe('select 1');
  });

  it('rejects an empty query', () => {
    expect(() => validateSelectOnly('')).toThrow(QueryValidationError);
    expect(() => validateSelectOnly('   ')).toThrow(/empty/);
  });

  it('rejects a query containing a null byte', () => {
    expect(() => validateSelectOnly('SELECT 1\0')).toThrow(/invalid characters/);
  });

  it('rejects a query that does not start with SELECT or WITH', () => {
    expect(() => validateSelectOnly('DELETE FROM t')).toThrow(
      /only SELECT \(or WITH ... SELECT\) statements are allowed/,
    );
  });

  it('rejects more than one statement', () => {
    expect(() => validateSelectOnly('SELECT 1; SELECT 2')).toThrow(
      /exactly one SQL statement is allowed, found 2/,
    );
  });

  it('rejects a write statement smuggled inside a CTE', () => {
    const query = 'WITH cte AS (DELETE FROM t RETURNING *) SELECT * FROM cte';
    expect(() => validateSelectOnly(query)).toThrow(/disallowed keyword detected: DELETE/);
  });

  it('is not fooled by a forbidden keyword inside a string literal', () => {
    expect(validateSelectOnly("SELECT 'please DELETE this' AS note")).toBe(
      "SELECT 'please DELETE this' AS note",
    );
  });

  it('is not fooled by a forbidden keyword inside a comment', () => {
    const query = '-- DELETE everything\nSELECT 1';
    expect(validateSelectOnly(query)).toBe(query);
  });

  it('rejects a dangerous MSSQL extended stored procedure reference', () => {
    expect(() => validateSelectOnly('SELECT 1 WHERE 1=1; EXEC xp_cmdshell')).toThrow(
      QueryValidationError,
    );
  });

  it('rejects a dangerous postgres function reference', () => {
    expect(() =>
      validateSelectOnly('SELECT pg_terminate_backend(pid) FROM pg_stat_activity'),
    ).toThrow(/disallowed function reference/);
  });
});
