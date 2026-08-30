import { describe, expect, it } from 'vitest';
import {
  CurlParseError,
  parseCurlCommand,
  tokenizeCurlCommand,
} from '../../../../src/tools/safe-curl/parse.js';

describe('tokenizeCurlCommand', () => {
  it('splits simple whitespace-separated words', () => {
    expect(tokenizeCurlCommand('curl https://example.com -X GET')).toEqual([
      'curl',
      'https://example.com',
      '-X',
      'GET',
    ]);
  });

  it('treats tabs and repeated spaces as separators', () => {
    expect(tokenizeCurlCommand('curl\t\thttps://example.com   -X  GET')).toEqual([
      'curl',
      'https://example.com',
      '-X',
      'GET',
    ]);
  });

  it('preserves spaces inside a single-quoted token, with no escape processing', () => {
    expect(tokenizeCurlCommand(String.raw`curl -H 'accept: text\slash'`)).toEqual([
      'curl',
      '-H',
      String.raw`accept: text\slash`,
    ]);
  });

  it('processes backslash escapes inside a double-quoted token', () => {
    expect(tokenizeCurlCommand(String.raw`curl -d "a \"quoted\" value"`)).toEqual([
      'curl',
      '-d',
      'a "quoted" value',
    ]);
  });

  it('processes a backslash escape in an unquoted word', () => {
    expect(tokenizeCurlCommand(String.raw`curl a\ b`)).toEqual(['curl', 'a b']);
  });

  it('drops a backslash-newline line continuation, joining across lines', () => {
    const input = "curl 'https://example.com' \\\n  -H 'accept: json' \\\n  -X POST";
    expect(tokenizeCurlCommand(input)).toEqual([
      'curl',
      'https://example.com',
      '-H',
      'accept: json',
      '-X',
      'POST',
    ]);
  });

  it('preserves an empty quoted token', () => {
    expect(tokenizeCurlCommand("curl -d ''")).toEqual(['curl', '-d', '']);
  });

  it('throws on an unterminated single quote', () => {
    expect(() => tokenizeCurlCommand("curl -H 'unterminated")).toThrow(CurlParseError);
  });

  it('throws on an unterminated double quote', () => {
    expect(() => tokenizeCurlCommand('curl -H "unterminated')).toThrow(CurlParseError);
  });
});

describe('parseCurlCommand', () => {
  it('defaults to GET with no headers/body for a bare URL', () => {
    expect(parseCurlCommand('curl https://example.com/path')).toEqual({
      method: 'GET',
      url: 'https://example.com/path',
      headers: {},
      body: undefined,
    });
  });

  it('works without a leading "curl" token', () => {
    expect(parseCurlCommand('https://example.com/path')).toEqual({
      method: 'GET',
      url: 'https://example.com/path',
      headers: {},
      body: undefined,
    });
  });

  it('honors an explicit -X method, uppercased', () => {
    const result = parseCurlCommand("curl -X put 'https://example.com'");
    expect(result.method).toBe('PUT');
  });

  it('infers POST when data is present and -X is omitted', () => {
    const result = parseCurlCommand("curl 'https://example.com' --data-raw '{}'");
    expect(result.method).toBe('POST');
  });

  it('an explicit -X wins over data-implied POST', () => {
    const result = parseCurlCommand("curl -X PATCH 'https://example.com' -d '{}'");
    expect(result.method).toBe('PATCH');
  });

  it('parses -H headers, trimming name and value', () => {
    const result = parseCurlCommand(
      "curl 'https://example.com' -H 'Accept:   application/json' -H 'content-host: api'",
    );
    expect(result.headers).toEqual({
      Accept: 'application/json',
      'content-host': 'api',
    });
  });

  it('maps -b/--cookie onto a Cookie header', () => {
    const result = parseCurlCommand("curl 'https://example.com' -b 'sessionid=abc123'");
    expect(result.headers.Cookie).toBe('sessionid=abc123');
  });

  it('joins multiple -d/--data-raw parts with &', () => {
    const result = parseCurlCommand("curl 'https://example.com' -d 'a=1' -d 'b=2'");
    expect(result.body).toBe('a=1&b=2');
  });

  it('maps -A to User-Agent and -e to Referer', () => {
    const result = parseCurlCommand(
      "curl 'https://example.com' -A 'MyAgent/1.0' -e 'https://ref.example'",
    );
    expect(result.headers['User-Agent']).toBe('MyAgent/1.0');
    expect(result.headers.Referer).toBe('https://ref.example');
  });

  it('ignores recognized no-op flags like --compressed, -s, -L', () => {
    const result = parseCurlCommand("curl 'https://example.com' --compressed -s -L");
    expect(result).toEqual({
      method: 'GET',
      url: 'https://example.com',
      headers: {},
      body: undefined,
    });
  });

  it('parses the full shape of a real browser-copied curl (minus secrets)', () => {
    const input = [
      "curl 'https://api-example-hml.example.com/example-billing-service/api/monthly-fees/service' \\",
      "  -H 'accept: application/json, text/plain, */*' \\",
      "  -H 'content-host: api' \\",
      "  -H 'content-type: application/json' \\",
      "  -H 'email: jane.doe@example.com' \\",
      "  -H 'origin: https://dev-plataforma.example.com' \\",
      '  --compressed \\',
      '  --data-raw \'{"inscription":10408870}\'',
    ].join('\n');

    const result = parseCurlCommand(input);
    expect(result.method).toBe('POST');
    expect(result.url).toBe(
      'https://api-example-hml.example.com/example-billing-service/api/monthly-fees/service',
    );
    expect(result.headers).toEqual({
      accept: 'application/json, text/plain, */*',
      'content-host': 'api',
      'content-type': 'application/json',
      email: 'jane.doe@example.com',
      origin: 'https://dev-plataforma.example.com',
    });
    expect(result.body).toBe('{"inscription":10408870}');
  });

  it('throws on an unsupported flag, naming it', () => {
    expect(() => parseCurlCommand("curl 'https://example.com' --foo bar")).toThrow(/--foo/);
  });

  it('throws when no URL is present', () => {
    expect(() => parseCurlCommand('curl -X GET')).toThrow(/no URL found/);
  });

  it('throws when more than one positional (URL-like) argument is given', () => {
    expect(() => parseCurlCommand("curl 'https://a.example' 'https://b.example'")).toThrow(
      /multiple URL-like arguments/,
    );
  });

  it('throws naming the flag when a value-taking flag has no value', () => {
    expect(() => parseCurlCommand("curl 'https://example.com' -H")).toThrow(/-H requires a value/);
  });

  it('throws on a malformed -H value with no colon', () => {
    expect(() => parseCurlCommand("curl 'https://example.com' -H 'not-a-header'")).toThrow(
      /malformed -H value/,
    );
  });

  it('throws on -u/--user, naming it as unsupported basic auth', () => {
    expect(() => parseCurlCommand("curl -u 'user:pass' 'https://example.com'")).toThrow(
      /-u\/--user/,
    );
  });

  it('throws on an empty curl command', () => {
    expect(() => parseCurlCommand('   ')).toThrow(/curl command is empty/);
  });
});
