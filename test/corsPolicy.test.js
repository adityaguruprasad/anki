const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
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

test('buildCorsOptions preserves permissive behavior when no allowlist is configured', () => {
  assert.deepEqual(buildCorsOptions({}), {});
  assert.deepEqual(buildCorsOptions({ CORS_ALLOWED_ORIGINS: '' }), {});
  assert.deepEqual(buildCorsOptions({ CORS_ALLOWED_ORIGINS: ' , , ' }), {});
});

test('normalizeAllowedOrigins trims whitespace and ignores empty entries', () => {
  assert.deepEqual(
    normalizeAllowedOrigins(' https://app.example.com, ,https://admin.example.com,,  http://localhost:3000 '),
    ['https://app.example.com', 'https://admin.example.com', 'http://localhost:3000'],
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

test('configured CORS allowlist allows exact matching origins', async () => {
  const options = buildCorsOptions({
    CORS_ALLOWED_ORIGINS: 'https://app.example.com, https://admin.example.com',
  });

  const decision = await runOriginDecision(options, 'https://admin.example.com');

  assert.equal(decision.error, null);
  assert.equal(decision.allowed, true);
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
