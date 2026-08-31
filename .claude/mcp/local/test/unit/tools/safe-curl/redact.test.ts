import { describe, expect, it } from 'vitest';
import { redactSensitiveHeaders } from '../../../../src/tools/safe-curl/redact.js';

describe('redactSensitiveHeaders', () => {
  it('redacts a set-cookie header', () => {
    expect(redactSensitiveHeaders({ 'set-cookie': 'sessionid=abc; Path=/' })).toEqual({
      'set-cookie': '[REDACTED]',
    });
  });

  it('redacts a www-authenticate header', () => {
    expect(redactSensitiveHeaders({ 'www-authenticate': 'Basic realm="api"' })).toEqual({
      'www-authenticate': '[REDACTED]',
    });
  });

  it('redacts a proxy-authenticate header', () => {
    expect(redactSensitiveHeaders({ 'proxy-authenticate': 'Basic realm="proxy"' })).toEqual({
      'proxy-authenticate': '[REDACTED]',
    });
  });

  it('redacts a header whose name merely contains "auth"', () => {
    expect(redactSensitiveHeaders({ 'x-auth-request-user': 'jdoe' })).toEqual({
      'x-auth-request-user': '[REDACTED]',
    });
  });

  it('redacts a header whose name merely contains "token"', () => {
    expect(redactSensitiveHeaders({ 'x-csrf-token': 'abc123' })).toEqual({
      'x-csrf-token': '[REDACTED]',
    });
  });

  it('is case-insensitive on the header name (Set-Cookie)', () => {
    expect(redactSensitiveHeaders({ 'Set-Cookie': 'sessionid=abc' })).toEqual({
      'Set-Cookie': '[REDACTED]',
    });
  });

  it('is case-insensitive on the header name (X-AUTH-TOKEN)', () => {
    expect(redactSensitiveHeaders({ 'X-AUTH-TOKEN': 'abc123' })).toEqual({
      'X-AUTH-TOKEN': '[REDACTED]',
    });
  });

  it('does not redact an unrelated header', () => {
    expect(redactSensitiveHeaders({ 'content-type': 'application/json' })).toEqual({
      'content-type': 'application/json',
    });
  });

  it('does not redact a header whose name merely contains "cookie" but is not set-cookie', () => {
    expect(redactSensitiveHeaders({ 'x-cookie-debug': 'on' })).toEqual({
      'x-cookie-debug': 'on',
    });
  });

  it('leaves unrelated headers untouched while redacting the sensitive one in the same object', () => {
    expect(
      redactSensitiveHeaders({ 'content-type': 'application/json', 'set-cookie': 'sessionid=abc' }),
    ).toEqual({ 'content-type': 'application/json', 'set-cookie': '[REDACTED]' });
  });

  it('returns an empty object for an empty headers object', () => {
    expect(redactSensitiveHeaders({})).toEqual({});
  });
});
