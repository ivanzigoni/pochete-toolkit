// Fake replacement for the `pg` package, swapped in for the e2e suite by
// fake-driver-loader.mjs. Mimics only the surface src/tools/safe-query/db/postgres.ts actually
// calls (`new Client(config).connect()/.query()/.end()`) against a small set of canned queries —
// no real network connection is made. This lets tests spawn the *real* MCP server end-to-end
// (real run.sh, real tsx entrypoint, real validation) without requiring a real Postgres server.

const CANNED_ROWS = {
  'select 1 as one': { fields: [{ name: 'one' }], rows: [{ one: 1 }] },
  'select 2 as two': { fields: [{ name: 'two' }], rows: [{ two: 2 }] },
  'select id, name from fake_users order by id': {
    fields: [{ name: 'id' }, { name: 'name' }],
    rows: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
      { id: 3, name: 'Linus' },
    ],
  },
  // Exercises _scripts/safe-query/_tests/safe-query.bats' Unicode/emoji and shell-metacharacter
  // cases end to end (real bash wrapper -> real validation -> this fake driver), keyed on the
  // exact (lowercased/trimmed) query text the wrapper produces for each fixture/inline -q value.
  "select 'a; drop table x; --' as one": {
    fields: [{ name: 'one' }],
    rows: [{ one: 'a; DROP TABLE x; --' }],
  },
  "select 'wörld 🌍' as greeting": {
    fields: [{ name: 'greeting' }],
    rows: [{ greeting: 'wörld 🌍' }],
  },
  '-- a comment first\nselect\n  1 as one,\n  2 as two': {
    fields: [{ name: 'one' }, { name: 'two' }],
    rows: [{ one: 1, two: 2 }],
  },
};

const CONTROL_STATEMENTS = new Set(['BEGIN', 'ROLLBACK', 'SET TRANSACTION READ ONLY']);

export class Client {
  constructor(config) {
    this.config = config;
  }

  async connect() {
    if (this.config.password !== 'testpass') {
      throw new Error('fake-pg: unexpected password wiring');
    }
  }

  async query(text) {
    if (CONTROL_STATEMENTS.has(text) || text.startsWith('SET LOCAL statement_timeout')) {
      return { fields: [], rows: [] };
    }
    const canned = CANNED_ROWS[text.trim().toLowerCase()];
    if (!canned) {
      throw new Error(`fake-pg: no canned response for query: ${text}`);
    }
    return canned;
  }

  async end() {}
}
