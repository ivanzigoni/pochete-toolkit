import { describe, expect, it } from 'vitest';
import {
  assertNoInlineAuthHeaders,
  CurlValidationError,
} from '../../../../src/tools/safe-curl/validate.js';

describe('assertNoInlineAuthHeaders', () => {
  it('does not throw when there is no Cookie or Authorization header', () => {
    expect(() =>
      assertNoInlineAuthHeaders({ Accept: 'application/json', 'content-host': 'api' }),
    ).not.toThrow();
  });

  it('does not throw for an empty headers object', () => {
    expect(() => assertNoInlineAuthHeaders({})).not.toThrow();
  });

  it('throws when a Cookie header is present, naming it', () => {
    expect(() => assertNoInlineAuthHeaders({ Cookie: 'sessionid=abc' })).toThrow(
      CurlValidationError,
    );
    expect(() => assertNoInlineAuthHeaders({ Cookie: 'sessionid=abc' })).toThrow(/Cookie/);
  });

  it('throws when an Authorization header is present, naming it', () => {
    expect(() => assertNoInlineAuthHeaders({ Authorization: 'Bearer xyz' })).toThrow(
      CurlValidationError,
    );
    expect(() => assertNoInlineAuthHeaders({ Authorization: 'Bearer xyz' })).toThrow(
      /Authorization/,
    );
  });

  it('is case-insensitive on the header name (lowercase cookie)', () => {
    expect(() => assertNoInlineAuthHeaders({ cookie: 'sessionid=abc' })).toThrow(
      CurlValidationError,
    );
  });

  it('is case-insensitive on the header name (uppercase AUTHORIZATION)', () => {
    expect(() => assertNoInlineAuthHeaders({ AUTHORIZATION: 'Bearer xyz' })).toThrow(
      CurlValidationError,
    );
  });

  it("error message points at the authProfile's env var as the sanctioned source", () => {
    expect(() => assertNoInlineAuthHeaders({ Cookie: 'x' })).toThrow(/authProfile's env var/);
  });

  it('does not flag an unrelated header whose name merely contains "cookie"', () => {
    expect(() => assertNoInlineAuthHeaders({ 'X-Cookie-Debug': 'on' })).not.toThrow();
  });

  it('throws when the header matches the profile-specific injectedHeaderName, naming it', () => {
    expect(() =>
      assertNoInlineAuthHeaders({ 'X-Api-Key': 'ptr_fake' }, 'X-API-Key'),
    ).toThrow(CurlValidationError);
    expect(() =>
      assertNoInlineAuthHeaders({ 'X-Api-Key': 'ptr_fake' }, 'X-API-Key'),
    ).toThrow(/X-Api-Key/);
  });

  it('does not flag an unrelated header when injectedHeaderName is a non-default header', () => {
    expect(() =>
      assertNoInlineAuthHeaders({ Accept: 'application/json' }, 'X-API-Key'),
    ).not.toThrow();
  });

  it('still throws on Cookie/Authorization even when injectedHeaderName is something else', () => {
    expect(() => assertNoInlineAuthHeaders({ Cookie: 'x' }, 'X-API-Key')).toThrow(
      CurlValidationError,
    );
    expect(() => assertNoInlineAuthHeaders({ Authorization: 'Bearer x' }, 'X-API-Key')).toThrow(
      CurlValidationError,
    );
  });
});
