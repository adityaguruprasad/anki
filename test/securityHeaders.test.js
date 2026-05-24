const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  DEFAULT_SECURITY_HEADERS,
  PRODUCTION_SECURITY_HEADERS,
  STRICT_TRANSPORT_SECURITY_HEADER,
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
} = require('../securityHeaders');

const EXPECTED_DEFAULT_SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

function createRes() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

test('default security headers are immutable and exactly match the API baseline', () => {
  assert.equal(Object.isFrozen(DEFAULT_SECURITY_HEADERS), true);
  assert.deepEqual(DEFAULT_SECURITY_HEADERS, EXPECTED_DEFAULT_SECURITY_HEADERS);
  assert.deepEqual(
    buildSecurityHeaders(undefined, { NODE_ENV: 'test' }),
    EXPECTED_DEFAULT_SECURITY_HEADERS,
  );
});

test('unset environment config keeps the non-production security header baseline', () => {
  const headers = buildSecurityHeaders(undefined, {});

  assert.equal(Object.hasOwn(headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('primitive, null, undefined, and array config values keep the non-production security header baseline', () => {
  const arrayConfig = [];
  arrayConfig.NODE_ENV = 'production';

  for (const config of [null, undefined, 'production', 42, true, arrayConfig]) {
    const headers = buildSecurityHeaders(undefined, config);

    assert.equal(Object.hasOwn(headers, 'Strict-Transport-Security'), false);
    assert.deepEqual(headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
  }
});

test('inherited data NODE_ENV config is ignored by security header production detection', () => {
  const config = Object.create({ NODE_ENV: 'production' });
  const headers = buildSecurityHeaders(undefined, config);
  const res = createRes();

  createSecurityHeadersMiddleware(undefined, config)({}, res, () => {});

  assert.equal(Object.hasOwn(headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
  assert.equal(Object.hasOwn(res.headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(res.headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('inherited NODE_ENV config is ignored without invoking getters', () => {
  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'NODE_ENV', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'production';
    },
  });
  const config = Object.create(prototype);
  const headers = buildSecurityHeaders(undefined, config);
  const res = createRes();

  createSecurityHeadersMiddleware(undefined, config)({}, res, () => {});

  assert.equal(getterCalls, 0);
  assert.equal(Object.hasOwn(headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
  assert.equal(Object.hasOwn(res.headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(res.headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('accessor-backed NODE_ENV config is ignored without invoking getters', () => {
  let getterCalls = 0;
  const config = {};
  Object.defineProperty(config, 'NODE_ENV', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'production';
    },
  });

  const headers = buildSecurityHeaders(undefined, config);
  const res = createRes();
  createSecurityHeadersMiddleware(undefined, config)({}, res, () => {});

  assert.equal(getterCalls, 0);
  assert.equal(Object.hasOwn(headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
  assert.equal(Object.hasOwn(res.headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(res.headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('security headers middleware emits the exact default header set', () => {
  const res = createRes();

  createSecurityHeadersMiddleware(undefined, { NODE_ENV: 'test' })({}, res, () => {});

  assert.deepEqual(res.headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('production security headers add conservative HSTS by default', () => {
  assert.equal(Object.isFrozen(PRODUCTION_SECURITY_HEADERS), true);
  assert.deepEqual(PRODUCTION_SECURITY_HEADERS, {
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });

  assert.deepEqual(buildSecurityHeaders(undefined, { NODE_ENV: 'production' }), {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });
});

test('security headers read process.env when config is omitted', () => {
  const hadNodeEnv = Object.hasOwn(process.env, 'NODE_ENV');
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = 'production';

    const headers = buildSecurityHeaders();
    const res = createRes();
    createSecurityHeadersMiddleware()({}, res, () => {});

    assert.deepEqual(headers, {
      ...EXPECTED_DEFAULT_SECURITY_HEADERS,
      'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
    });
    assert.deepEqual(res.headers, {
      ...EXPECTED_DEFAULT_SECURITY_HEADERS,
      'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
    });
  } finally {
    if (hadNodeEnv) {
      process.env.NODE_ENV = previousNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
});

test('own data NODE_ENV config enables production security headers', () => {
  const prototype = {};
  Object.defineProperty(prototype, 'NODE_ENV', {
    get() {
      throw new Error('prototype NODE_ENV getter should not run');
    },
  });
  const config = Object.create(prototype);
  Object.defineProperty(config, 'NODE_ENV', {
    enumerable: true,
    value: 'production',
  });
  const res = createRes();

  const headers = buildSecurityHeaders(undefined, config);
  createSecurityHeadersMiddleware(undefined, config)({}, res, () => {});

  assert.deepEqual(headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });
  assert.deepEqual(res.headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });
});

test('null-prototype NODE_ENV config enables production security headers', () => {
  const config = Object.create(null);
  Object.defineProperty(config, 'NODE_ENV', {
    enumerable: true,
    value: 'production',
  });
  const res = createRes();

  const headers = buildSecurityHeaders(undefined, config);
  createSecurityHeadersMiddleware(undefined, config)({}, res, () => {});

  assert.deepEqual(headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });
  assert.deepEqual(res.headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });
});

test('security header overrides can replace or disable production HSTS', () => {
  assert.deepEqual(
    buildSecurityHeaders(
      { 'Strict-Transport-Security': 'max-age=0' },
      { NODE_ENV: 'production' },
    ),
    {
      ...EXPECTED_DEFAULT_SECURITY_HEADERS,
      'Strict-Transport-Security': 'max-age=0',
    },
  );

  const headers = buildSecurityHeaders(
    { 'Strict-Transport-Security': false },
    { NODE_ENV: 'production' },
  );

  assert.equal(Object.hasOwn(headers, 'Strict-Transport-Security'), false);
  assert.deepEqual(headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('Cache-Control override replaces the default while preserving other security headers', () => {
  const headers = buildSecurityHeaders(
    { 'Cache-Control': 'public, max-age=3600' },
    { NODE_ENV: 'test' },
  );

  assert.equal(headers['Cache-Control'], 'public, max-age=3600');
  assert.deepEqual(headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Cache-Control': 'public, max-age=3600',
  });
});

test('security headers middleware emits production HSTS from injected environment config', () => {
  const res = createRes();

  createSecurityHeadersMiddleware(undefined, { NODE_ENV: 'production' })({}, res, () => {});

  assert.deepEqual(res.headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
  });
});

test('security header overrides replace values and false/null/undefined disable defaults', () => {
  const headers = buildSecurityHeaders(
    {
      'Cache-Control': false,
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': false,
      'Cross-Origin-Resource-Policy': null,
      'Cross-Origin-Opener-Policy': undefined,
      'Permissions-Policy': false,
    },
    { NODE_ENV: 'test' },
  );

  assert.equal(headers['Referrer-Policy'], 'same-origin');
  assert.equal(Object.hasOwn(headers, 'Cache-Control'), false);
  assert.equal(Object.hasOwn(headers, 'X-Frame-Options'), false);
  assert.equal(Object.hasOwn(headers, 'Cross-Origin-Resource-Policy'), false);
  assert.equal(Object.hasOwn(headers, 'Cross-Origin-Opener-Policy'), false);
  assert.equal(Object.hasOwn(headers, 'Permissions-Policy'), false);
  assert.deepEqual(headers, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
  });
});

test('security header overrides can add new headers', () => {
  const headers = buildSecurityHeaders(
    { 'X-Robots-Tag': 'noindex' },
    { NODE_ENV: 'test' },
  );

  assert.equal(headers['X-Robots-Tag'], 'noindex');
  assert.deepEqual(headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'X-Robots-Tag': 'noindex',
  });
});

test('security header overrides can replace the default Permissions-Policy', () => {
  const headers = buildSecurityHeaders(
    { 'Permissions-Policy': 'geolocation=()' },
    { NODE_ENV: 'test' },
  );

  assert.equal(headers['Permissions-Policy'], 'geolocation=()');
  assert.deepEqual(headers, {
    ...EXPECTED_DEFAULT_SECURITY_HEADERS,
    'Permissions-Policy': 'geolocation=()',
  });
});

test('security header overrides coerce numeric and boolean true primitive values', () => {
  const headers = buildSecurityHeaders({
    'X-Test-Number': 42,
    'X-Test-Boolean': true,
  });

  assert.equal(headers['X-Test-Number'], '42');
  assert.equal(headers['X-Test-Boolean'], 'true');
});

test('security header overrides reject arrays and objects as values', () => {
  assert.throws(
    () => buildSecurityHeaders({ 'X-Test': ['value'] }),
    {
      name: 'TypeError',
      message: /security header override for X-Test must be a primitive value/,
    },
  );
  assert.throws(
    () => buildSecurityHeaders({ 'X-Test': { value: 'same-origin' } }),
    {
      name: 'TypeError',
      message: /security header override for X-Test must be a primitive value/,
    },
  );
});

test('security header options reject invalid top-level values', () => {
  for (const options of ['headers', 42, true, [], () => {}]) {
    assert.throws(
      () => buildSecurityHeaders(options),
      {
        name: 'TypeError',
        message: /security header options must be a flat header override object/,
      },
    );
  }
});

test('security header options do not special-case a headers wrapper', () => {
  assert.throws(
    () => buildSecurityHeaders({
      headers: {
        'X-Frame-Options': 'SAMEORIGIN',
      },
    }),
    {
      name: 'TypeError',
      message: /security header override for headers must be a primitive value/,
    },
  );
  assert.throws(
    () => createSecurityHeadersMiddleware({
      headers: {
        'X-Frame-Options': 'SAMEORIGIN',
      },
    }),
    {
      name: 'TypeError',
      message: /security header override for headers must be a primitive value/,
    },
  );
});

test('security headers middleware calls next exactly once', () => {
  const res = createRes();
  let nextCalls = 0;

  createSecurityHeadersMiddleware(undefined, { NODE_ENV: 'test' })({}, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
});

test('server mounts security headers before CORS, JSON parsing, and auth', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const securityHeadersImportIndex = serverSource.indexOf(
    "const { createSecurityHeadersMiddleware } = require('./securityHeaders');",
  );
  const securityHeadersIndex = serverSource.indexOf('app.use(createSecurityHeadersMiddleware());');
  const corsIndex = serverSource.indexOf('app.use(cors(buildCorsOptions()));');
  const jsonParserIndex = serverSource.indexOf('app.use(createJsonBodyParser(express));');
  const protectedAuthIndex = serverSource.indexOf('app.use(authenticateToken);');

  assert.ok(securityHeadersImportIndex >= 0, 'Expected server.js to import the security headers helper');
  assert.ok(securityHeadersIndex >= 0, 'Expected server.js to mount security headers middleware');
  assert.ok(corsIndex > securityHeadersIndex, 'Expected security headers before CORS middleware');
  assert.ok(jsonParserIndex > securityHeadersIndex, 'Expected security headers before JSON parsing');
  assert.ok(protectedAuthIndex > securityHeadersIndex, 'Expected security headers before auth middleware');
});
