const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CORS_ALLOWED_ORIGINS_ENV,
  CORS_ORIGIN_REJECTED_ERROR,
  buildCorsOptions,
  handleCorsError,
  isCorsOriginRejectedError,
  normalizeAllowedOrigins,
} = require('../corsPolicy');

function runOriginDecision(options, origin) {
  return new Promise((resolve) => {
    options.origin(origin, (error, allowed) => {
      resolve({ error, allowed });
    });
  });
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('buildCorsOptions preserves permissive behavior outside production when no allowlist is configured', () => {
  assert.deepEqual(buildCorsOptions({}), {});
  assert.deepEqual(buildCorsOptions({ CORS_ALLOWED_ORIGINS: '' }), {});
  assert.deepEqual(buildCorsOptions({ CORS_ALLOWED_ORIGINS: ' , , ' }), {});
  assert.deepEqual(buildCorsOptions({ NODE_ENV: 'test' }), {});
  assert.deepEqual(buildCorsOptions({ NODE_ENV: 'development' }), {});
});

test('buildCorsOptions reads process.env when config is omitted', async () => {
  const hadNodeEnv = Object.hasOwn(process.env, 'NODE_ENV');
  const previousNodeEnv = process.env.NODE_ENV;
  const hadAllowedOrigins = Object.hasOwn(process.env, CORS_ALLOWED_ORIGINS_ENV);
  const previousAllowedOrigins = process.env[CORS_ALLOWED_ORIGINS_ENV];

  try {
    process.env.NODE_ENV = 'production';
    delete process.env[CORS_ALLOWED_ORIGINS_ENV];

    const options = buildCorsOptions();

    assert.equal(typeof options.origin, 'function');
    assert.deepEqual(
      await runOriginDecision(options, undefined),
      { error: null, allowed: true },
    );

    const browserOriginDecision = await runOriginDecision(options, 'https://app.example.com');
    assert.equal(browserOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(browserOriginDecision.error), true);
  } finally {
    if (hadNodeEnv) {
      process.env.NODE_ENV = previousNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (hadAllowedOrigins) {
      process.env[CORS_ALLOWED_ORIGINS_ENV] = previousAllowedOrigins;
    } else {
      delete process.env[CORS_ALLOWED_ORIGINS_ENV];
    }
  }
});

test('buildCorsOptions treats primitive, null, undefined, and array config as absent', () => {
  const arrayConfig = [];
  arrayConfig.NODE_ENV = 'production';
  arrayConfig.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

  for (const config of [null, undefined, 'production', 42, true, arrayConfig]) {
    assert.deepEqual(buildCorsOptions(config), {});
  }
});

test('buildCorsOptions ignores inherited config fields', () => {
  const config = Object.create({
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    NODE_ENV: 'production',
  });

  assert.deepEqual(buildCorsOptions(config), {});
});

test('buildCorsOptions ignores accessor-backed config fields without invoking getters', () => {
  let getterCalls = 0;
  const config = {};
  Object.defineProperties(config, {
    CORS_ALLOWED_ORIGINS: {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'https://app.example.com';
      },
    },
    NODE_ENV: {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'production';
      },
    },
  });

  assert.deepEqual(buildCorsOptions(config), {});
  assert.equal(getterCalls, 0);
});

test('buildCorsOptions uses own data config fields', async () => {
  const prototype = {};
  Object.defineProperties(prototype, {
    CORS_ALLOWED_ORIGINS: {
      get() {
        throw new Error('prototype CORS getter should not run');
      },
    },
    NODE_ENV: {
      get() {
        throw new Error('prototype NODE_ENV getter should not run');
      },
    },
  });
  const config = Object.create(prototype);
  Object.defineProperties(config, {
    CORS_ALLOWED_ORIGINS: {
      enumerable: true,
      value: 'https://app.example.com',
    },
    NODE_ENV: {
      enumerable: true,
      value: 'production',
    },
  });

  const options = buildCorsOptions(config);

  assert.equal(typeof options.origin, 'function');
  assert.deepEqual(
    await runOriginDecision(options, 'https://app.example.com'),
    { error: null, allowed: true },
  );
});

test('normalizeAllowedOrigins trims whitespace and ignores empty entries', () => {
  assert.deepEqual(
    normalizeAllowedOrigins(' https://app.example.com, ,https://admin.example.com,,  http://localhost:3000 '),
    ['https://app.example.com', 'https://admin.example.com', 'http://localhost:3000'],
  );
});

test('normalizeAllowedOrigins canonicalizes origin-only URL entries', () => {
  assert.deepEqual(
    normalizeAllowedOrigins(' https://app.example.com/, https://admin.example.com///, http://localhost:3000/ '),
    ['https://app.example.com', 'https://admin.example.com', 'http://localhost:3000'],
  );
  assert.deepEqual(
    normalizeAllowedOrigins('https://app.example.com:443, http://localhost:80'),
    ['https://app.example.com', 'http://localhost'],
  );
  assert.deepEqual(
    normalizeAllowedOrigins('http://[::1]:3000/'),
    ['http://[::1]:3000'],
  );
});

test('normalizeAllowedOrigins drops non-origin entries before building the allowlist', () => {
  assert.deepEqual(
    normalizeAllowedOrigins(
      'https://app.example.com/path, https://app.example.com?tenant=admin, https://app.example.com#admin, https://user:pass@app.example.com, file://app.example.com, null, not a url',
    ),
    [],
  );
  assert.deepEqual(
    normalizeAllowedOrigins('https://app.example.com, null, not a url, https://admin.example.com/path'),
    ['https://app.example.com'],
  );
});

test('configured CORS allowlist allows requests with no Origin header', async () => {
  const options = buildCorsOptions({
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
  });

  const decision = await runOriginDecision(options, undefined);

  assert.equal(decision.error, null);
  assert.equal(decision.allowed, true);
});

test('production CORS rejects browser origins when no allowlist is configured', async () => {
  for (const CORS_ALLOWED_ORIGINS of [undefined, '', ' , , ']) {
    const options = buildCorsOptions({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS,
    });

    assert.equal(typeof options.origin, 'function');

    const noOriginDecision = await runOriginDecision(options, undefined);
    assert.equal(noOriginDecision.error, null);
    assert.equal(noOriginDecision.allowed, true);

    const browserOriginDecision = await runOriginDecision(options, 'https://app.example.com');
    assert.equal(browserOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(browserOriginDecision.error), true);
    assert.equal(browserOriginDecision.error.message, CORS_ORIGIN_REJECTED_ERROR);
    assert.doesNotMatch(browserOriginDecision.error.message, /app\.example/i);
  }
});

test('configured CORS allowlist allows exact matching origins', async () => {
  const options = buildCorsOptions({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com, https://admin.example.com',
  });

  const decision = await runOriginDecision(options, 'https://admin.example.com');

  assert.equal(decision.error, null);
  assert.equal(decision.allowed, true);
});

test('configured CORS allowlist accepts origin URLs with harmless trailing slashes', async () => {
  const options = buildCorsOptions({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com/, http://localhost:3000/, http://[::1]:3000/',
  });

  assert.deepEqual(
    await runOriginDecision(options, 'https://app.example.com'),
    { error: null, allowed: true },
  );
  assert.deepEqual(
    await runOriginDecision(options, 'http://localhost:3000'),
    { error: null, allowed: true },
  );
  assert.deepEqual(
    await runOriginDecision(options, 'http://[::1]:3000'),
    { error: null, allowed: true },
  );
});

test('configured CORS allowlist does not broaden entries that include paths', async () => {
  const options = buildCorsOptions({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com/admin',
  });

  const decision = await runOriginDecision(options, 'https://app.example.com');

  assert.equal(decision.allowed, undefined);
  assert.equal(isCorsOriginRejectedError(decision.error), true);
});

test('configured CORS allowlist fails closed when every configured entry is invalid', async () => {
  for (const NODE_ENV of ['development', 'test', 'production']) {
    const options = buildCorsOptions({
      NODE_ENV,
      CORS_ALLOWED_ORIGINS: 'https://app.example.com/path, null, file://app.example.com, not a url',
    });

    assert.equal(typeof options.origin, 'function');

    const noOriginDecision = await runOriginDecision(options, undefined);
    assert.equal(noOriginDecision.error, null);
    assert.equal(noOriginDecision.allowed, true);

    const browserOriginDecision = await runOriginDecision(options, 'https://app.example.com');
    assert.equal(browserOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(browserOriginDecision.error), true);

    const opaqueOriginDecision = await runOriginDecision(options, 'null');
    assert.equal(opaqueOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(opaqueOriginDecision.error), true);
  }
});

test('configured CORS allowlist does not broaden entries that include query or hash', async () => {
  const options = buildCorsOptions({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com?tenant=admin, https://admin.example.com#dashboard',
  });

  for (const origin of ['https://app.example.com', 'https://admin.example.com']) {
    const decision = await runOriginDecision(options, origin);

    assert.equal(decision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(decision.error), true);
  }
});

test('configured CORS allowlist ignores invalid entries without allowing invalid origins', async () => {
  for (const NODE_ENV of ['development', 'test', 'production']) {
    const options = buildCorsOptions({
      NODE_ENV,
      CORS_ALLOWED_ORIGINS: 'https://app.example.com, null, file://app.example.com, not a url',
    });

    assert.deepEqual(
      await runOriginDecision(options, 'https://app.example.com'),
      { error: null, allowed: true },
    );

    const disallowedBrowserOriginDecision = await runOriginDecision(options, 'https://evil.example.com');
    assert.equal(disallowedBrowserOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(disallowedBrowserOriginDecision.error), true);

    const opaqueOriginDecision = await runOriginDecision(options, 'null');
    assert.equal(opaqueOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(opaqueOriginDecision.error), true);

    const fileOriginDecision = await runOriginDecision(options, 'file://app.example.com');
    assert.equal(fileOriginDecision.allowed, undefined);
    assert.equal(isCorsOriginRejectedError(fileOriginDecision.error), true);
  }
});

test('configured CORS allowlist rejects disallowed browser origins with a sanitized error', async () => {
  const options = buildCorsOptions({
    CORS_ALLOWED_ORIGINS: 'https://secret.example.com',
  });

  const decision = await runOriginDecision(options, 'https://evil.example.com');

  assert.equal(decision.allowed, undefined);
  assert.equal(isCorsOriginRejectedError(decision.error), true);
  assert.equal(decision.error.message, CORS_ORIGIN_REJECTED_ERROR);
  assert.doesNotMatch(decision.error.message, /secret|evil/i);

  const res = createRes();
  let nextCall = null;

  handleCorsError(decision.error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: CORS_ORIGIN_REJECTED_ERROR });
  assert.doesNotMatch(JSON.stringify(res.body), /secret|evil/i);
});

test('server mounts configurable CORS policy before JSON parsing and auth', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const corsIndex = serverSource.indexOf('app.use(cors(buildCorsOptions()));');
  const corsErrorIndex = serverSource.indexOf('app.use(handleCorsError);');
  const jsonParserIndex = serverSource.indexOf('app.use(createJsonBodyParser(express));');
  const protectedAuthIndex = serverSource.indexOf('app.use(authenticateToken);');

  assert.ok(corsIndex >= 0, 'Expected server.js to mount CORS with generated options');
  assert.ok(corsErrorIndex > corsIndex, 'Expected CORS error handler after CORS middleware');
  assert.ok(jsonParserIndex > corsErrorIndex, 'Expected bounded JSON parser after CORS middleware');
  assert.ok(protectedAuthIndex > jsonParserIndex, 'Expected auth middleware after body parsing');
});
