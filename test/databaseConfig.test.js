const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  REQUIRED_DATABASE_URL_ERROR,
  buildDatabasePoolConfig,
  hasConfiguredDatabaseUrl,
} = require('../databaseConfig');

test('production database config requires DATABASE_URL before creating pg Pool options', () => {
  for (const DATABASE_URL of [undefined, '', '   ']) {
    assert.throws(
      () => buildDatabasePoolConfig({ NODE_ENV: 'production', DATABASE_URL }),
      {
        name: 'Error',
        message: REQUIRED_DATABASE_URL_ERROR,
      },
    );
  }
});

test('development and test database config preserve pg default Pool behavior without DATABASE_URL', () => {
  for (const NODE_ENV of [undefined, 'development', 'test']) {
    assert.deepEqual(buildDatabasePoolConfig({ NODE_ENV }), {});
    assert.deepEqual(buildDatabasePoolConfig({ NODE_ENV, DATABASE_URL: '' }), {});
    assert.deepEqual(buildDatabasePoolConfig({ NODE_ENV, DATABASE_URL: '   ' }), {});
  }
});

test('database config preserves the exact non-empty DATABASE_URL value', () => {
  const connectionString = '  postgres://user:pass@db.example.com:5432/anki?sslmode=require  ';

  assert.equal(hasConfiguredDatabaseUrl(connectionString), true);
  assert.deepEqual(
    buildDatabasePoolConfig({
      NODE_ENV: 'production',
      DATABASE_URL: connectionString,
    }),
    { connectionString },
  );
});

test('database config treats all-whitespace values as unconfigured', () => {
  assert.equal(hasConfiguredDatabaseUrl('   '), false);
  assert.equal(hasConfiguredDatabaseUrl('\t\n'), false);
  assert.equal(hasConfiguredDatabaseUrl(' postgres://db.example.com/anki '), true);
});

test('server builds database config before constructing pg Pool', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const databaseConfigImportIndex = serverSource.indexOf(
    "const { buildDatabasePoolConfig } = require('./databaseConfig');",
  );
  const poolIndex = serverSource.indexOf('const pool = new Pool(buildDatabasePoolConfig());');
  const authHandlersIndex = serverSource.indexOf('const { register, login, authenticateToken } = createAuthHandlers(pool);');

  assert.ok(databaseConfigImportIndex >= 0, 'Expected server.js to import the database config helper');
  assert.ok(poolIndex >= 0, 'Expected server.js to construct Pool from the database config helper');
  assert.ok(authHandlersIndex > poolIndex, 'Expected auth handlers to be created after Pool construction');
});
