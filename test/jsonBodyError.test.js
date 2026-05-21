const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  INVALID_JSON_REQUEST_BODY_ERROR,
  JSON_BODY_LIMIT,
  JSON_REQUEST_BODY_ARRAY_ERROR,
  JSON_REQUEST_BODY_TOO_LARGE_ERROR,
  JSON_REQUEST_BODY_UNSUPPORTED_ENCODING_ERROR,
  createJsonBodyParser,
  handleJsonBodyError,
  isJsonBodyTooLargeError,
  isJsonBodyUnsupportedEncodingError,
  isMalformedJsonBodyError,
  rejectJsonArrayBody,
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

function createJsonUnsupportedEncodingError(type = 'encoding.unsupported', encoding = 'br') {
  const error = new Error('unsupported request encoding');
  error.status = 415;
  error.statusCode = 415;
  error.type = type;
  error.encoding = encoding;
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
  assert.deepEqual(receivedOptions, { inflate: false, limit: JSON_BODY_LIMIT });
  assert.equal(
    Object.hasOwn(receivedOptions, 'strict'),
    false,
    'Expected Express strict JSON parsing to keep primitive bodies as parser errors',
  );
});

test('createJsonBodyParser rejects invalid Express modules', () => {
  assert.throws(
    () => createJsonBodyParser({}),
    { name: 'TypeError', message: 'createJsonBodyParser requires an Express module with a json method' },
  );
});

test('rejectJsonArrayBody rejects top-level JSON array bodies before route handling', () => {
  const res = createRes();
  let nextCalls = 0;

  rejectJsonArrayBody({
    body: [{ password: 'secret', deckId: 1 }],
  }, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: JSON_REQUEST_BODY_ARRAY_ERROR });
  assert.doesNotMatch(JSON.stringify(res.body), /secret|deckId|password/i);
});

test('rejectJsonArrayBody passes through parsed object and absent body requests', () => {
  const cases = [
    ['parsed object body', { name: 'Biology' }],
    ['empty parsed object body', {}],
    ['absent body', undefined],
  ];

  for (const [label, body] of cases) {
    const res = createRes();
    let nextCalls = 0;

    rejectJsonArrayBody({ body }, res, () => {
      nextCalls += 1;
    });

    assert.equal(nextCalls, 1, `${label} should continue to route handling`);
    assert.equal(res.statusCode, 200, `${label} should not set an error status`);
    assert.equal(res.body, null, `${label} should not write a response body`);
  }
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

test('handleJsonBodyError returns a sanitized API JSON error for unsupported JSON encodings', () => {
  const error = createJsonUnsupportedEncodingError();
  const res = createRes();
  let nextCall = null;

  handleJsonBodyError(error, {}, res, (nextError) => {
    nextCall = nextError;
  });

  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 415);
  assert.deepEqual(res.body, { error: JSON_REQUEST_BODY_UNSUPPORTED_ENCODING_ERROR });
  assert.equal(isJsonBodyUnsupportedEncodingError(error), true);
  assert.doesNotMatch(JSON.stringify(res.body), /br|unsupported request encoding/i);
});

test('bounded JSON parser disables body inflation before route handling', () => {
  const unsupportedEncodingError = createJsonUnsupportedEncodingError(
    'encoding.unsupported',
    'gzip'
  );
  let receivedOptions = null;
  let routeReached = false;
  const fakeExpress = {
    json(options) {
      receivedOptions = options;
      return (req, res, next) => {
        if (req.headers?.['content-encoding'] && options.inflate === false) {
          next(unsupportedEncodingError);
          return;
        }

        routeReached = true;
        res.json({ parsed: true });
      };
    },
  };
  const req = {
    headers: {
      'content-encoding': 'gzip',
    },
  };
  const res = createRes();
  const parser = createJsonBodyParser(fakeExpress);
  let nextCall = null;

  parser(req, res, (error) => {
    handleJsonBodyError(error, req, res, (nextError) => {
      nextCall = nextError;
    });
  });

  assert.deepEqual(receivedOptions, { inflate: false, limit: JSON_BODY_LIMIT });
  assert.equal(routeReached, false);
  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 415);
  assert.deepEqual(res.body, { error: JSON_REQUEST_BODY_UNSUPPORTED_ENCODING_ERROR });
  assert.doesNotMatch(JSON.stringify(res.body), /gzip|unsupported request encoding/i);
});

test('isJsonBodyUnsupportedEncodingError recognizes unsupported JSON charsets and statusCode-only errors', () => {
  const unsupportedCharsetError = createJsonUnsupportedEncodingError('charset.unsupported');
  const statusCodeOnlyError = createJsonUnsupportedEncodingError();
  delete statusCodeOnlyError.status;

  assert.equal(isJsonBodyUnsupportedEncodingError(unsupportedCharsetError), true);
  assert.equal(isJsonBodyUnsupportedEncodingError(statusCodeOnlyError), true);
});

test('isJsonBodyUnsupportedEncodingError requires a 415 status for unsupported encoding types', () => {
  const unsupportedEncodingTypeOnlyError = createJsonUnsupportedEncodingError();
  const unsupportedCharsetTypeOnlyError = createJsonUnsupportedEncodingError('charset.unsupported');
  delete unsupportedEncodingTypeOnlyError.status;
  delete unsupportedEncodingTypeOnlyError.statusCode;
  delete unsupportedCharsetTypeOnlyError.status;
  delete unsupportedCharsetTypeOnlyError.statusCode;

  assert.equal(isJsonBodyUnsupportedEncodingError(unsupportedEncodingTypeOnlyError), false);
  assert.equal(isJsonBodyUnsupportedEncodingError(unsupportedCharsetTypeOnlyError), false);
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

test('handleJsonBodyError forwards arbitrary 415 errors without an unsupported JSON encoding signature', () => {
  const error = Object.assign(new Error('different 415 failure'), {
    status: 415,
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
  assert.equal(isJsonBodyUnsupportedEncodingError(error), false);
});

test('server mounts bounded JSON body parsing immediately before JSON body error handling and auth', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const jsonParserIndex = serverSource.indexOf('app.use(createJsonBodyParser(express));');
  const jsonBodyErrorHandlerIndex = serverSource.indexOf('app.use(handleJsonBodyError);');
  const jsonArrayBodyGuardIndex = serverSource.indexOf('app.use(rejectJsonArrayBody);');
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
    /const\s+\{\s*createJsonBodyParser,\s*handleJsonBodyError,\s*rejectJsonArrayBody\s*\}\s*=\s*require\(['"]\.\/jsonBodyError['"]\);/,
    'Expected server.js to import the bounded JSON parser helper',
  );
  assert.ok(jsonParserIndex >= 0, 'Expected server.js to mount bounded JSON parsing');
  assert.ok(jsonBodyErrorHandlerIndex > jsonParserIndex, 'Expected handler after bounded JSON parsing');
  assert.ok(
    jsonArrayBodyGuardIndex > jsonBodyErrorHandlerIndex,
    'Expected top-level JSON array rejection after parser error handling',
  );
  assert.ok(
    registerRouteIndex > jsonArrayBodyGuardIndex && loginRouteIndex > jsonArrayBodyGuardIndex,
    'Expected public auth routes to run after JSON body shape enforcement',
  );
  assert.ok(
    protectedAuthIndex > jsonArrayBodyGuardIndex,
    'Expected protected auth middleware to run after JSON body shape enforcement',
  );
});
