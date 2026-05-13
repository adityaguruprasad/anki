const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  DEFAULT_SECURITY_HEADERS,
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
} = require('../securityHeaders');

const EXPECTED_DEFAULT_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
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
  assert.deepEqual(buildSecurityHeaders(), EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('security headers middleware emits the exact default header set', () => {
  const res = createRes();

  createSecurityHeadersMiddleware()({}, res, () => {});

  assert.deepEqual(res.headers, EXPECTED_DEFAULT_SECURITY_HEADERS);
});

test('security header overrides replace values and false/null/undefined disable defaults', () => {
  const headers = buildSecurityHeaders({
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': false,
    'Cross-Origin-Resource-Policy': null,
    'Cross-Origin-Opener-Policy': undefined,
  });

  assert.equal(headers['Referrer-Policy'], 'same-origin');
  assert.equal(Object.hasOwn(headers, 'X-Frame-Options'), false);
  assert.equal(Object.hasOwn(headers, 'Cross-Origin-Resource-Policy'), false);
  assert.equal(Object.hasOwn(headers, 'Cross-Origin-Opener-Policy'), false);
  assert.deepEqual(headers, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
  });
});

test('security header overrides can add new headers', () => {
  const headers = buildSecurityHeaders({
    'Permissions-Policy': 'geolocation=()',
  });

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

  createSecurityHeadersMiddleware()({}, res, () => {
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
