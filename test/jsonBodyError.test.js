const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  INVALID_JSON_REQUEST_BODY_ERROR,
  handleMalformedJsonBody,
  isMalformedJsonBodyError,
} = require('../jsonBodyError');

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

function createJsonParseError() {
  const error = new SyntaxError('Unexpected token } in JSON at position 1');
  error.status = 400;
  error.type = 'entity.parse.failed';
  return error;
}

test('handleMalformedJsonBody returns the API JSON error shape for invalid JSON bodies', () => {
  const error = createJsonParseError();
  const res = createRes();
  let nextCall = null;

  handleMalformedJsonBody(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: INVALID_JSON_REQUEST_BODY_ERROR });
});

test('handleMalformedJsonBody forwards unrelated errors to the next error handler', () => {
  const error = Object.assign(new SyntaxError('different parser failure'), {
    status: 400,
    type: 'entity.verify.failed',
  });
  const res = createRes();
  let nextCall = null;

  handleMalformedJsonBody(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, error);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.equal(isMalformedJsonBodyError(error), false);
});

test('server mounts malformed JSON handling immediately after express.json and before auth', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const jsonParserIndex = serverSource.indexOf('app.use(express.json());');
  const malformedJsonHandlerIndex = serverSource.indexOf('app.use(handleMalformedJsonBody);');
  const registerRouteIndex = serverSource.indexOf("app.post('/api/register', register);");
  const loginRouteIndex = serverSource.indexOf("app.post('/api/login', login);");
  const protectedAuthIndex = serverSource.indexOf('app.use(authenticateToken);');

  assert.match(
    serverSource,
    /app\.use\(express\.json\(\)\);\s*app\.use\(handleMalformedJsonBody\);/,
    'Expected malformed JSON handling to be mounted immediately after express.json()',
  );
  assert.ok(jsonParserIndex >= 0, 'Expected server.js to mount express.json()');
  assert.ok(malformedJsonHandlerIndex > jsonParserIndex, 'Expected handler after express.json()');
  assert.ok(
    registerRouteIndex > malformedJsonHandlerIndex && loginRouteIndex > malformedJsonHandlerIndex,
    'Expected public auth routes to run after malformed JSON handling',
  );
  assert.ok(
    protectedAuthIndex > malformedJsonHandlerIndex,
    'Expected protected auth middleware to run after malformed JSON handling',
  );
});
