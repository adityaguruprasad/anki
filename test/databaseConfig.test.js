const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  DATABASE_URL_ENV,
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

test('database config with no argument reads process.env', () => {
  const hadDatabaseUrl = Object.prototype.hasOwnProperty.call(process.env, DATABASE_URL_ENV);
  const hadNodeEnv = Object.prototype.hasOwnProperty.call(process.env, 'NODE_ENV');
  const previousDatabaseUrl = process.env[DATABASE_URL_ENV];
  const previousNodeEnv = process.env.NODE_ENV;
  const connectionString = 'postgres://process-env.example.com/anki';

  try {
    process.env[DATABASE_URL_ENV] = connectionString;
    delete process.env.NODE_ENV;

    assert.deepEqual(buildDatabasePoolConfig(), { connectionString });
  } finally {
    if (hadDatabaseUrl) {
      process.env[DATABASE_URL_ENV] = previousDatabaseUrl;
    } else {
      delete process.env[DATABASE_URL_ENV];
    }

    if (hadNodeEnv) {
      process.env.NODE_ENV = previousNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
});

test('database config treats all-whitespace values as unconfigured', () => {
  assert.equal(hasConfiguredDatabaseUrl('   '), false);
  assert.equal(hasConfiguredDatabaseUrl('\t\n'), false);
  assert.equal(hasConfiguredDatabaseUrl(' postgres://db.example.com/anki '), true);
});

test('database config ignores inherited DATABASE_URL and NODE_ENV values', () => {
  const config = Object.create({
    DATABASE_URL: 'postgres://inherited.example.com/anki',
    NODE_ENV: 'production',
  });

  assert.deepEqual(buildDatabasePoolConfig(config), {});

  const productionConfig = Object.create({
    DATABASE_URL: 'postgres://inherited.example.com/anki',
  });
  Object.defineProperty(productionConfig, 'NODE_ENV', {
    value: 'production',
    enumerable: true,
  });

  assert.throws(() => buildDatabasePoolConfig(productionConfig), {
    name: 'Error',
    message: REQUIRED_DATABASE_URL_ERROR,
  });
});

test('database config ignores accessor-backed environment values without invoking getters', () => {
  let databaseUrlGetterCalls = 0;
  let nodeEnvGetterCalls = 0;
  const config = {};

  Object.defineProperties(config, {
    DATABASE_URL: {
      enumerable: true,
      get() {
        databaseUrlGetterCalls += 1;
        return 'postgres://accessor.example.com/anki';
      },
    },
    NODE_ENV: {
      enumerable: true,
      get() {
        nodeEnvGetterCalls += 1;
        return 'production';
      },
    },
  });

  assert.deepEqual(buildDatabasePoolConfig(config), {});
  assert.equal(databaseUrlGetterCalls, 0);
  assert.equal(nodeEnvGetterCalls, 0);
});

test('database config fail-closes in production when DATABASE_URL is accessor-backed', () => {
  let databaseUrlGetterCalls = 0;
  const config = {};

  Object.defineProperties(config, {
    DATABASE_URL: {
      enumerable: true,
      get() {
        databaseUrlGetterCalls += 1;
        return 'postgres://accessor.example.com/anki';
      },
    },
    NODE_ENV: {
      value: 'production',
      enumerable: true,
    },
  });

  assert.throws(() => buildDatabasePoolConfig(config), {
    name: 'Error',
    message: REQUIRED_DATABASE_URL_ERROR,
  });
  assert.equal(databaseUrlGetterCalls, 0);
});

test('database config trusts own data properties that shadow polluted prototypes', () => {
  const connectionString = 'postgres://trusted.example.com/anki';
  const config = Object.create({
    DATABASE_URL: 'postgres://inherited.example.com/anki',
    NODE_ENV: 'production',
  });

  Object.defineProperties(config, {
    DATABASE_URL: {
      value: connectionString,
      enumerable: true,
    },
    NODE_ENV: {
      value: 'production',
      enumerable: true,
    },
  });

  assert.deepEqual(buildDatabasePoolConfig(config), { connectionString });
});

test('database config accepts null-prototype env records with own data properties', () => {
  const connectionString = 'postgres://null-prototype.example.com/anki';
  const config = Object.create(null);

  Object.defineProperties(config, {
    DATABASE_URL: {
      value: connectionString,
      enumerable: true,
    },
    NODE_ENV: {
      value: 'production',
      enumerable: true,
    },
  });

  assert.deepEqual(buildDatabasePoolConfig(config), { connectionString });
});

test('database config ignores arrays and primitives supplied as configs', () => {
  const arrayConfig = [];
  arrayConfig.DATABASE_URL = 'postgres://array.example.com/anki';
  arrayConfig.NODE_ENV = 'production';

  assert.deepEqual(buildDatabasePoolConfig(arrayConfig), {});
  assert.deepEqual(buildDatabasePoolConfig('postgres://string.example.com/anki'), {});
  assert.deepEqual(buildDatabasePoolConfig(1), {});
  assert.deepEqual(buildDatabasePoolConfig(null), {});
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
