import { describe, expect, it } from 'vitest';
import {
  assertNoScopeOverride,
  AwsCommandValidationError,
  validateCommand,
} from '../../../../src/tools/aws-safe-cli/validate.js';

describe('assertNoScopeOverride', () => {
  it('does not throw for args with no scope flag', () => {
    expect(() => assertNoScopeOverride(['--output', 'json'])).not.toThrow();
  });

  it('does not throw for an empty args array', () => {
    expect(() => assertNoScopeOverride([])).not.toThrow();
  });

  it.each(['--region', '--profile', '--endpoint-url'])(
    'throws when args contains the exact scope flag "%s"',
    (flag) => {
      expect(() => assertNoScopeOverride([flag, 'value'])).toThrow(AwsCommandValidationError);
      expect(() => assertNoScopeOverride([flag, 'value'])).toThrow(
        new RegExp(flag.replace(/-/g, '\\-')),
      );
    },
  );

  it.each(['--region=us-west-2', '--profile=other', '--endpoint-url=https://evil.example'])(
    'throws when args contains the "=" form "%s"',
    (flag) => {
      expect(() => assertNoScopeOverride([flag])).toThrow(AwsCommandValidationError);
    },
  );

  it('does not flag an unrelated flag that merely starts with the same letters', () => {
    expect(() => assertNoScopeOverride(['--region-name-filter'])).not.toThrow();
  });
});

describe('validateCommand', () => {
  it('allows any args when the rule is an empty object', () => {
    expect(() => validateCommand('s3', 'ls', ['--recursive'], {})).not.toThrow();
  });

  it('rejects a forbidden long flag', () => {
    expect(() =>
      validateCommand('ec2', 'terminate-instances', ['--force'], {
        forbidLongFlags: ['--force'],
      }),
    ).toThrow(AwsCommandValidationError);
  });

  it('rejects a forbidden short flag inside a combined cluster', () => {
    expect(() =>
      validateCommand('s3', 'rm', ['-rf'], { forbidShortFlags: ['f'] }),
    ).toThrow(AwsCommandValidationError);
  });

  it('does not reject a long flag that merely contains the forbidden short letter', () => {
    expect(() =>
      validateCommand('s3', 'rm', ['--force'], { forbidShortFlags: ['f'] }),
    ).not.toThrow();
  });

  it('rejects when a required flag is absent', () => {
    expect(() =>
      validateCommand('s3', 'rm', ['s3://bucket/key'], { requireFlag: '--dryrun' }),
    ).toThrow(AwsCommandValidationError);
  });

  it('allows when the required flag is present', () => {
    expect(() =>
      validateCommand('s3', 'rm', ['s3://bucket/key', '--dryrun'], { requireFlag: '--dryrun' }),
    ).not.toThrow();
  });

  it('rejects when none of requireAnyFlag is present', () => {
    expect(() =>
      validateCommand('logs', 'tail', ['/my/log-group'], {
        requireAnyFlag: ['--since', '--follow'],
      }),
    ).toThrow(AwsCommandValidationError);
  });

  it('allows when one of requireAnyFlag is present', () => {
    expect(() =>
      validateCommand('logs', 'tail', ['/my/log-group', '--since', '1h'], {
        requireAnyFlag: ['--since', '--follow'],
      }),
    ).not.toThrow();
  });

  it('rejects a token starting with the forbidden prefix', () => {
    expect(() =>
      validateCommand('ec2', 'run-instances', ['--', 'rm', '-rf', '/'], {
        forbidTokenPrefix: '--',
      }),
    ).toThrow(AwsCommandValidationError);
  });

  describe('verbRule', () => {
    const rule = {
      verbRule: { bareAllowed: true, allowedVerbs: ['get', 'list'], flagImpliesAllowed: false },
    };

    it('allows a bare invocation when bareAllowed is true', () => {
      expect(() => validateCommand('ssm', 'get-parameter', [], rule)).not.toThrow();
    });

    it('allows an allowed verb', () => {
      expect(() => validateCommand('ssm', 'get-parameter', ['get'], rule)).not.toThrow();
    });

    it('rejects a verb outside allowedVerbs', () => {
      expect(() => validateCommand('ssm', 'get-parameter', ['delete'], rule)).toThrow(
        AwsCommandValidationError,
      );
    });

    it('rejects a bare invocation when bareAllowed is false', () => {
      expect(() =>
        validateCommand('ssm', 'get-parameter', [], {
          verbRule: { bareAllowed: false, allowedVerbs: ['get'] },
        }),
      ).toThrow(AwsCommandValidationError);
    });

    it('rejects a flag as the verb when flagImpliesAllowed is false', () => {
      expect(() => validateCommand('ssm', 'get-parameter', ['--help'], rule)).toThrow(
        AwsCommandValidationError,
      );
    });

    it('allows a flag as the verb when flagImpliesAllowed is true', () => {
      expect(() =>
        validateCommand('ssm', 'get-parameter', ['--help'], {
          verbRule: { bareAllowed: true, allowedVerbs: ['get'], flagImpliesAllowed: true },
        }),
      ).not.toThrow();
    });
  });
});
