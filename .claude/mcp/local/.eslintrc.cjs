/* eslint-disable @typescript-eslint/no-var-requires */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: ['airbnb-base', 'prettier'],
  ignorePatterns: [
    'node_modules',
    'dist',
    'coverage',
    // Synthetic NestJS-shaped source trees the generate-module-report tool scans in tests —
    // deliberately non-standard fixtures (weird-arg, no-name-prop, ...), not this project's own code.
    'test/fixtures/generate-module-report/**',
    // Same as above, for generate-domain-map's own multi-project fixture set.
    'test/fixtures/generate-domain-map/**',
  ],
  settings: {
    // Lets eslint-plugin-import follow this NodeNext project's `.js`-extensioned relative
    // specifiers (e.g. `../../src/.../mssql-queries.js`) back to their real `.ts` source, from
    // both TS and the plain-JS test fixtures that import straight from src/.
    'import/resolver': {
      typescript: {
        project: './tsconfig.eslint.json',
      },
    },
  },
  rules: {
    // This server's tools are invoked via stdio MCP transport with no attached console —
    // console.error is the only way to surface diagnostics, so it's allowed everywhere.
    'no-console': ['error', { allow: ['error'] }],
    // NodeNext ESM resolution requires the explicit .js extension on relative specifiers even
    // though the source files are .ts (TypeScript rewrites the extension at compile time).
    'import/extensions': ['error', 'ignorePackages', { js: 'always', mjs: 'always', ts: 'never' }],
    // Filenames throughout this codebase are kebab-case modules with one primary export
    // (register.ts, query.ts, ...), not a single default export per file.
    'import/prefer-default-export': 'off',
    // This is a Node 22 / ES2022-target project (see tsconfig `target`) — there is no Babel or
    // regenerator-runtime anywhere in the toolchain, so Airbnb's for..of ban (written for a
    // Babel-era browser target) does not apply here. for..in/labels/with stay banned.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ForInStatement',
        message:
          'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
      },
      {
        selector: 'LabeledStatement',
        message:
          'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
      },
      {
        selector: 'WithStatement',
        message:
          '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: __dirname,
      },
      plugins: ['@typescript-eslint', 'sonarjs'],
      extends: [
        'airbnb-base',
        'airbnb-typescript/base',
        'plugin:sonarjs/recommended-legacy',
        'prettier',
      ],
      settings: {
        'import/resolver': {
          typescript: {
            project: './tsconfig.eslint.json',
          },
        },
      },
      rules: {
        'no-console': ['error', { allow: ['error'] }],
        'import/extensions': [
          'error',
          'ignorePackages',
          { js: 'always', mjs: 'always', ts: 'never' },
        ],
        'import/prefer-default-export': 'off',
        'import/no-extraneous-dependencies': [
          'error',
          { devDependencies: ['test/**/*.ts', '*.config.ts'] },
        ],
        // See the root-level rule of the same name: no Babel/regenerator-runtime in this
        // toolchain, so for..of is fine — only for..in/labels/with stay banned.
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ForInStatement',
            message:
              'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
          },
          {
            selector: 'LabeledStatement',
            message:
              'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
          },
          {
            selector: 'WithStatement',
            message:
              '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
          },
        ],
      },
    },
    {
      files: ['test/**/*.ts'],
      rules: {
        // Test suites assert on internal shapes and stub dependencies routinely.
        '@typescript-eslint/no-non-null-assertion': 'off',
        'sonarjs/no-duplicate-string': 'off',
        'sonarjs/cognitive-complexity': 'off',
        // A vi.mock() factory for a driver package (pg/mssql) routinely needs a couple of small
        // tightly-coupled fake classes together (e.g. Transaction + Request) to mirror its shape.
        'max-classes-per-file': 'off',
      },
    },
    {
      files: [
        'test/fixtures/fake-pg.mjs',
        'test/fixtures/fake-pg-database-schema.mjs',
        'test/fixtures/fake-mssql.mjs',
        'test/fixtures/fake-mssql-database-schema.mjs',
      ],
      rules: {
        // These fakes deliberately group a couple of tightly-coupled mock classes (pool +
        // client/request) per file to mirror the shape of the real `pg`/`mssql` driver, and
        // their transaction methods (begin/rollback/end) are legitimately no-ops in a fake.
        'max-classes-per-file': 'off',
        'class-methods-use-this': 'off',
        'no-empty-function': 'off',
        'lines-between-class-members': 'off',
      },
    },
  ],
};
