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

function defineNonEnumerableOwnDataProperties(object, properties) {
  for (const [propertyName, value] of Object.entries(properties)) {
    Object.defineProperty(object, propertyName, {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    });
  }

  return object;
}

function defineGetterProperties(object, properties, onGetterCall) {
  for (const [propertyName, value] of Object.entries(properties)) {
    Object.defineProperty(object, propertyName, {
      configurable: true,
      enumerable: true,
      get() {
        onGetterCall();
        return value;
      },
    });
  }

  return object;
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

test('rejectJsonArrayBody ignores inherited request body properties', () => {
  const req = Object.create({
    body: [{ password: 'inherited-secret', deckId: 1 }],
  });
  const res = createRes();
  let downstreamBody = 'not-called';
  let nextCalls = 0;

  rejectJsonArrayBody(req, res, () => {
    nextCalls += 1;
    downstreamBody = req.body;
  });

  assert.equal(nextCalls, 1);
  assert.equal(downstreamBody, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(req, 'body'), {
    configurable: true,
    enumerable: false,
    value: undefined,
    writable: true,
  });
  assert.equal(req.body, undefined);
});

test('rejectJsonArrayBody fails closed when inherited request body cannot be shadowed', () => {
  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'body', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return [{ password: 'inherited-secret', deckId: 1 }];
    },
  });
  const req = Object.preventExtensions(Object.create(prototype));
  const res = createRes();
  let nextCalls = 0;

  rejectJsonArrayBody(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(getterCalls, 0);
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: JSON_REQUEST_BODY_ARRAY_ERROR });
  assert.equal(Object.hasOwn(req, 'body'), false);
  assert.equal(getterCalls, 0);
});

test('rejectJsonArrayBody ignores accessor-backed request body properties', () => {
  const req = {};
  const res = createRes();
  let downstreamBody = 'not-called';
  let getterCalls = 0;
  let nextCalls = 0;

  Object.defineProperty(req, 'body', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return [{ password: 'accessor-secret', deckId: 1 }];
    },
  });

  rejectJsonArrayBody(req, res, () => {
    nextCalls += 1;
    downstreamBody = req.body;
  });

  assert.equal(getterCalls, 0);
  assert.equal(nextCalls, 1);
  assert.equal(downstreamBody, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(req, 'body'), {
    configurable: true,
    enumerable: true,
    value: undefined,
    writable: true,
  });
  assert.equal(req.body, undefined);
  assert.equal(getterCalls, 0);
});

test('rejectJsonArrayBody fails closed when accessor-backed request body cannot be shadowed', () => {
  const req = {};
  const res = createRes();
  let getterCalls = 0;
  let nextCalls = 0;
  function getBody() {
    getterCalls += 1;
    return [{ password: 'accessor-secret', deckId: 1 }];
  }

  Object.defineProperty(req, 'body', {
    configurable: false,
    enumerable: true,
    get: getBody,
  });

  rejectJsonArrayBody(req, res, () => {
    nextCalls += 1;
  });

  const descriptor = Object.getOwnPropertyDescriptor(req, 'body');
  assert.equal(getterCalls, 0);
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: JSON_REQUEST_BODY_ARRAY_ERROR });
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.enumerable, true);
  assert.equal(descriptor.get, getBody);
  assert.equal(Object.hasOwn(descriptor, 'value'), false);
  assert.equal(getterCalls, 0);
});

test('rejectJsonArrayBody leaves ordinary absent request bodies absent', () => {
  const req = {};
  const res = createRes();
  let downstreamBody = 'not-called';
  let nextCalls = 0;

  rejectJsonArrayBody(req, res, () => {
    nextCalls += 1;
    downstreamBody = req.body;
  });

  assert.equal(nextCalls, 1);
  assert.equal(downstreamBody, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.equal(Object.hasOwn(req, 'body'), false);
});

test('rejectJsonArrayBody strips inherited fields from parsed object bodies', () => {
  const inheritedFields = {
    deckId: 42,
    password: 'inherited-secret',
  };
  const body = Object.create(inheritedFields);
  body.frontContent = 'Front';
  body.backContent = 'Back';
  const req = { body };
  const res = createRes();
  let nextCalls = 0;

  rejectJsonArrayBody(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(Object.getPrototypeOf(req.body), null);
  assert.deepEqual(Object.keys(req.body), ['frontContent', 'backContent']);
  assert.equal(req.body.frontContent, 'Front');
  assert.equal(req.body.backContent, 'Back');
  assert.equal(req.body.deckId, undefined);
  assert.equal(req.body.password, undefined);
});

test('isMalformedJsonBodyError recognizes non-enumerable own parser fields', () => {
  const error = defineNonEnumerableOwnDataProperties(
    new SyntaxError('Unexpected token } in JSON at position 1'),
    {
      status: 400,
      type: 'entity.parse.failed',
    },
  );

  assert.equal(isMalformedJsonBodyError(error), true);
});

test('isMalformedJsonBodyError rejects inherited and accessor-backed parser fields without invoking getters', () => {
  const inheritedPrototype = Object.create(SyntaxError.prototype);
  Object.defineProperties(inheritedPrototype, {
    status: {
      configurable: true,
      enumerable: true,
      value: 400,
      writable: true,
    },
    type: {
      configurable: true,
      enumerable: true,
      value: 'entity.parse.failed',
      writable: true,
    },
  });
  const inheritedError = new SyntaxError('Unexpected token } in JSON at position 1');
  Object.setPrototypeOf(inheritedError, inheritedPrototype);

  let inheritedGetterCalls = 0;
  const inheritedAccessorPrototype = Object.create(SyntaxError.prototype);
  defineGetterProperties(inheritedAccessorPrototype, {
    status: 400,
    type: 'entity.parse.failed',
  }, () => {
    inheritedGetterCalls += 1;
  });
  const inheritedAccessorError = new SyntaxError('Unexpected token } in JSON at position 1');
  Object.setPrototypeOf(inheritedAccessorError, inheritedAccessorPrototype);

  let ownGetterCalls = 0;
  const accessorError = new SyntaxError('Unexpected token } in JSON at position 1');
  defineGetterProperties(accessorError, {
    status: 400,
    type: 'entity.parse.failed',
  }, () => {
    ownGetterCalls += 1;
  });

  assert.equal(isMalformedJsonBodyError(inheritedError), false);
  assert.equal(isMalformedJsonBodyError(inheritedAccessorError), false);
  assert.equal(inheritedGetterCalls, 0);
  assert.equal(isMalformedJsonBodyError(accessorError), false);
  assert.equal(ownGetterCalls, 0);
});

test('isJsonBodyTooLargeError recognizes non-enumerable own parser fields', () => {
  const error = defineNonEnumerableOwnDataProperties(
    new Error('request entity too large'),
    {
      statusCode: 413,
      type: 'entity.too.large',
    },
  );

  assert.equal(isJsonBodyTooLargeError(error), true);
});

test('isJsonBodyTooLargeError rejects inherited and accessor-backed parser fields without invoking getters', () => {
  const inheritedError = Object.create({
    status: 413,
    statusCode: 413,
    type: 'entity.too.large',
  });

  let inheritedGetterCalls = 0;
  const inheritedAccessorError = Object.create(defineGetterProperties({}, {
    status: 413,
    statusCode: 413,
    type: 'entity.too.large',
  }, () => {
    inheritedGetterCalls += 1;
  }));

  let ownGetterCalls = 0;
  const accessorError = defineGetterProperties({}, {
    status: 413,
    statusCode: 413,
    type: 'entity.too.large',
  }, () => {
    ownGetterCalls += 1;
  });

  assert.equal(isJsonBodyTooLargeError(inheritedError), false);
  assert.equal(isJsonBodyTooLargeError(inheritedAccessorError), false);
  assert.equal(inheritedGetterCalls, 0);
  assert.equal(isJsonBodyTooLargeError(accessorError), false);
  assert.equal(ownGetterCalls, 0);
});

test('isJsonBodyUnsupportedEncodingError recognizes non-enumerable own parser fields', () => {
  const error = defineNonEnumerableOwnDataProperties(
    new Error('unsupported request encoding'),
    {
      statusCode: 415,
      type: 'charset.unsupported',
    },
  );

  assert.equal(isJsonBodyUnsupportedEncodingError(error), true);
});

test('isJsonBodyUnsupportedEncodingError rejects inherited and accessor-backed parser fields without invoking getters', () => {
  const inheritedError = Object.create({
    status: 415,
    statusCode: 415,
    type: 'encoding.unsupported',
  });

  let inheritedGetterCalls = 0;
  const inheritedAccessorError = Object.create(defineGetterProperties({}, {
    status: 415,
    statusCode: 415,
    type: 'encoding.unsupported',
  }, () => {
    inheritedGetterCalls += 1;
  }));

  let ownGetterCalls = 0;
  const accessorError = defineGetterProperties({}, {
    status: 415,
    statusCode: 415,
    type: 'encoding.unsupported',
  }, () => {
    ownGetterCalls += 1;
  });

  assert.equal(isJsonBodyUnsupportedEncodingError(inheritedError), false);
  assert.equal(isJsonBodyUnsupportedEncodingError(inheritedAccessorError), false);
  assert.equal(inheritedGetterCalls, 0);
  assert.equal(isJsonBodyUnsupportedEncodingError(accessorError), false);
  assert.equal(ownGetterCalls, 0);
});

test('rejectJsonArrayBody hides Object.prototype pollution from parsed object bodies', () => {
  const originalDeckId = Object.getOwnPropertyDescriptor(Object.prototype, 'deckId');
  const originalPassword = Object.getOwnPropertyDescriptor(Object.prototype, 'password');

  try {
    Object.defineProperty(Object.prototype, 'deckId', {
      configurable: true,
      enumerable: true,
      value: 42,
      writable: true,
    });
    Object.defineProperty(Object.prototype, 'password', {
      configurable: true,
      enumerable: true,
      value: 'prototype-secret',
      writable: true,
    });

    const body = {
      frontContent: 'Front',
      backContent: 'Back',
    };
    const req = { body };
    const res = createRes();
    let nextCalls = 0;

    assert.equal(body.deckId, 42);
    assert.equal(body.password, 'prototype-secret');

    rejectJsonArrayBody(req, res, () => {
      nextCalls += 1;
    });

    assert.equal(nextCalls, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, null);
    assert.equal(Object.getPrototypeOf(req.body), null);
    assert.deepEqual(Object.keys(req.body), ['frontContent', 'backContent']);
    assert.equal(req.body.frontContent, 'Front');
    assert.equal(req.body.backContent, 'Back');
    assert.equal(Object.hasOwn(req.body, 'deckId'), false);
    assert.equal(Object.hasOwn(req.body, 'password'), false);
    assert.equal(req.body.deckId, undefined);
    assert.equal(req.body.password, undefined);
  } finally {
    if (originalDeckId) {
      Object.defineProperty(Object.prototype, 'deckId', originalDeckId);
    } else {
      delete Object.prototype.deckId;
    }

    if (originalPassword) {
      Object.defineProperty(Object.prototype, 'password', originalPassword);
    } else {
      delete Object.prototype.password;
    }
  }
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
