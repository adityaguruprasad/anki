const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  INVALID_JSON_REQUEST_BODY_ERROR,
  JSON_BODY_LIMIT,
  JSON_REQUEST_BODY_TOO_LARGE_ERROR,
  createJsonBodyParser,
  handleJsonBodyError,
  isJsonBodyTooLargeError,
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

function createJsonTooLargeError() {
  const error = new Error('request entity too large');
  error.status = 413;
  error.statusCode = 413;
  error.type = 'entity.too.large';
  return error;
}

test('createJsonBodyParser configures an explicit JSON request budget', () => {
  const middleware = () => {};
  let receivedOptions = null;
  const fakeExpress = {
    json(options) {
      receivedOptions = options;
      return middleware;
    },
  };

  assert.equal(createJsonBodyParser(fakeExpress), middleware);
  assert.equal(JSON_BODY_LIMIT, '96kb');
  assert.deepEqual(receivedOptions, { limit: JSON_BODY_LIMIT });
});

test('createJsonBodyParser rejects invalid Express modules', () => {
  assert.throws(
    () => createJsonBodyParser({}),
    { name: 'TypeError', message: 'createJsonBodyParser requires an Express module with a json method' },
  );
});

test('handleJsonBodyError returns the API JSON error shape for invalid JSON bodies', () => {
  const error = createJsonParseError();
  const res = createRes();
  let nextCall = null;

  handleJsonBodyError(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: INVALID_JSON_REQUEST_BODY_ERROR });
});

test('handleJsonBodyError returns a sanitized API JSON error for oversized JSON bodies', () => {
  const error = createJsonTooLargeError();
  const res = createRes();
  let nextCall = null;

  handleJsonBodyError(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, { error: JSON_REQUEST_BODY_TOO_LARGE_ERROR });
  assert.equal(isJsonBodyTooLargeError(error), true);
});

test('isJsonBodyTooLargeError recognizes statusCode-only parser oversized errors', () => {
  const error = createJsonTooLargeError();
  delete error.status;

  assert.equal(isJsonBodyTooLargeError(error), true);
});

test('handleJsonBodyError forwards unrelated errors to the next error handler', () => {
  const error = Object.assign(new SyntaxError('different parser failure'), {
    status: 400,
    type: 'entity.verify.failed',
  });
  const res = createRes();
  let nextCall = null;

  handleJsonBodyError(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, error);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.equal(isMalformedJsonBodyError(error), false);
});

test('handleJsonBodyError forwards arbitrary 413 errors without the parser oversized signature', () => {
  const error = Object.assign(new Error('different 413 failure'), {
    status: 413,
    type: 'different.error',
  });
  const res = createRes();
  let nextCall = null;

  handleJsonBodyError(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, error);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.equal(isJsonBodyTooLargeError(error), false);
});

test('server mounts bounded JSON body parsing immediately before JSON body error handling and auth', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const jsonParserIndex = serverSource.indexOf('app.use(createJsonBodyParser(express));');
  const jsonBodyErrorHandlerIndex = serverSource.indexOf('app.use(handleJsonBodyError);');
  const registerRouteIndex = serverSource.indexOf("app.post('/api/register', register);");
  const loginRouteIndex = serverSource.indexOf("app.post('/api/login', login);");
  const protectedAuthIndex = serverSource.indexOf('app.use(authenticateToken);');

  assert.match(
    serverSource,
    /app\.use\(createJsonBodyParser\(express\)\);\s*app\.use\(handleJsonBodyError\);/,
    'Expected JSON body error handling to be mounted immediately after bounded JSON parsing',
  );
  assert.match(
    serverSource,
    /const\s+\{\s*createJsonBodyParser,\s*handleJsonBodyError\s*\}\s*=\s*require\(['"]\.\/jsonBodyError['"]\);/,
    'Expected server.js to import the bounded JSON parser helper',
  );
  assert.ok(jsonParserIndex >= 0, 'Expected server.js to mount bounded JSON parsing');
  assert.ok(jsonBodyErrorHandlerIndex > jsonParserIndex, 'Expected handler after bounded JSON parsing');
  assert.ok(
    registerRouteIndex > jsonBodyErrorHandlerIndex && loginRouteIndex > jsonBodyErrorHandlerIndex,
    'Expected public auth routes to run after JSON body error handling',
  );
  assert.ok(
    protectedAuthIndex > jsonBodyErrorHandlerIndex,
    'Expected protected auth middleware to run after JSON body error handling',
  );
});
