// Fake replacement for the `mssql` package, swapped in for the e2e suite by
// fake-driver-loader.mjs. Mimics only the surface src/db/mssql.ts actually calls
// (`sql.connect()`, `new sql.Transaction()`, `new sql.Request()`) against a small set of canned
// queries — no real network connection is made. See fake-pg.mjs for why.

const CANNED_ROWS = {
  'select 1 as one': [{ one: 1 }],
  'select 2 as two': [{ two: 2 }],
  'select id, name from fake_users order by id': [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
    { id: 3, name: 'Linus' },
  ],
  // Exercises test/e2e/safe-query.test.ts' Unicode/emoji and shell-metacharacter cases end to
  // end (real server -> real validation -> this fake driver) now that the checked-in
  // "cemiterio_dev" connection profile is mssql — mirrors the equivalent entries in fake-pg.mjs.
  "select 'wörld 🌍' as greeting": [{ greeting: 'wörld 🌍' }],
  "select 'a; drop table x; --' as one": [{ one: 'a; DROP TABLE x; --' }],
};

class Request {
  async query(text) {
    const canned = CANNED_ROWS[text.trim().toLowerCase()];
    if (!canned) {
      throw new Error(`fake-mssql: no canned response for query: ${text}`);
    }
    return { recordset: canned };
  }
}

class Transaction {
  async begin() {}
  async rollback() {}
}

async function connect(config) {
  if (config.password !== 'testpass') {
    throw new Error('fake-mssql: unexpected password wiring');
  }
  return { close: async () => {} };
}

export default { connect, Transaction, Request };
