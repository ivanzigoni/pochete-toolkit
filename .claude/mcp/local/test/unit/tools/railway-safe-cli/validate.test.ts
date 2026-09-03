import { describe, expect, it } from 'vitest';
import {
  assertNoScopeOverride,
  RailwayCommandValidationError,
  validateCommand,
} from '../../../../src/tools/railway-safe-cli/validate.js';

describe('assertNoScopeOverride', () => {
  it('does not throw for args with no scope flag', () => {
    expect(() => assertNoScopeOverride(['--json', '--all'])).not.toThrow();
  });

  it('does not throw for an empty args array', () => {
    expect(() => assertNoScopeOverride([])).not.toThrow();
  });

  it.each(['--project', '-p', '--environment', '-e', '--service', '-s'])(
    'throws when args contains the exact scope flag "%s"',
    (flag) => {
      expect(() => assertNoScopeOverride([flag, 'value'])).toThrow(RailwayCommandValidationError);
      expect(() => assertNoScopeOverride([flag, 'value'])).toThrow(
        new RegExp(flag.replace('-', '\\-')),
      );
    },
  );

  it.each(['--project=abc', '--environment=abc', '--service=abc'])(
    'throws when args contains the "=" form "%s"',
    (flag) => {
      expect(() => assertNoScopeOverride([flag])).toThrow(RailwayCommandValidationError);
    },
  );

  it('does not flag an unrelated flag that merely starts with the same letter', () => {
    expect(() => assertNoScopeOverride(['--persist'])).not.toThrow();
  });
});

describe('validateCommand', () => {
  it('allows any args when the rule is an empty object', () => {
    expect(() => validateCommand('status', ['--json', '-v'], {})).not.toThrow();
  });

  it('rejects a forbidden long flag', () => {
    expect(() => validateCommand('down', ['--yes'], { forbidLongFlags: ['--yes'] })).toThrow(
      RailwayCommandValidationError,
    );
  });

  it('rejects a forbidden short flag inside a combined cluster', () => {
    expect(() => validateCommand('down', ['-fy'], { forbidShortFlags: ['y'] })).toThrow(
      RailwayCommandValidationError,
    );
  });

  it('does not reject a long flag that merely contains the forbidden short letter', () => {
    expect(() => validateCommand('down', ['--yes'], { forbidShortFlags: ['y'] })).not.toThrow();
  });

  it('rejects when a required flag is absent', () => {
    expect(() => validateCommand('logs', [], { requireFlag: '--json' })).toThrow(
      RailwayCommandValidationError,
    );
  });

  it('allows when the required flag is present', () => {
    expect(() => validateCommand('logs', ['--json'], { requireFlag: '--json' })).not.toThrow();
  });

  it('rejects when none of requireAnyFlag is present', () => {
    expect(() =>
      validateCommand('variables', ['--set', 'X=1'], { requireAnyFlag: ['--json', '--kv'] }),
    ).toThrow(RailwayCommandValidationError);
  });

  it('allows when one of requireAnyFlag is present', () => {
    expect(() =>
      validateCommand('variables', ['--json'], { requireAnyFlag: ['--json', '--kv'] }),
    ).not.toThrow();
  });

  it('rejects a token starting with the forbidden prefix', () => {
    expect(() =>
      validateCommand('run', ['--', 'rm', '-rf', '/'], { forbidTokenPrefix: '--' }),
    ).toThrow(RailwayCommandValidationError);
  });

  describe('verbRule', () => {
    const rule = {
      verbRule: { bareAllowed: true, allowedVerbs: ['get', 'list'], flagImpliesAllowed: false },
    };

    it('allows a bare invocation when bareAllowed is true', () => {
      expect(() => validateCommand('variables', [], rule)).not.toThrow();
    });

    it('allows an allowed verb', () => {
      expect(() => validateCommand('variables', ['get'], rule)).not.toThrow();
    });

    it('rejects a verb outside allowedVerbs', () => {
      expect(() => validateCommand('variables', ['delete'], rule)).toThrow(
        RailwayCommandValidationError,
      );
    });

    it('rejects a bare invocation when bareAllowed is false', () => {
      expect(() =>
        validateCommand('variables', [], {
          verbRule: { bareAllowed: false, allowedVerbs: ['get'] },
        }),
      ).toThrow(RailwayCommandValidationError);
    });

    it('rejects a flag as the verb when flagImpliesAllowed is false', () => {
      expect(() => validateCommand('variables', ['--help'], rule)).toThrow(
        RailwayCommandValidationError,
      );
    });

    it('allows a flag as the verb when flagImpliesAllowed is true', () => {
      expect(() =>
        validateCommand('variables', ['--help'], {
          verbRule: { bareAllowed: true, allowedVerbs: ['get'], flagImpliesAllowed: true },
        }),
      ).not.toThrow();
    });
  });
});
