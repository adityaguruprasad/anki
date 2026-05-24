const { getOwnDataPropertyValue } = require('./recordDataProperty');

const INVALID_JSON_REQUEST_BODY_ERROR = 'Invalid JSON request body';
const JSON_REQUEST_BODY_ARRAY_ERROR = 'JSON request body must be an object';
const JSON_REQUEST_BODY_TOO_LARGE_ERROR = 'JSON request body too large';
const JSON_REQUEST_BODY_UNSUPPORTED_ENCODING_ERROR = 'Unsupported JSON request body encoding';
// Above the current largest intended card payload, below Express' broad default.
const JSON_BODY_LIMIT = '96kb';

function createJsonBodyParser(expressModule) {
  if (!expressModule || typeof expressModule.json !== 'function') {
    throw new TypeError('createJsonBodyParser requires an Express module with a json method');
  }

  return expressModule.json({ inflate: false, limit: JSON_BODY_LIMIT });
}

function hasOwnDataPropertyValue(object, propertyName, expectedValue) {
  return getOwnDataPropertyValue(object, propertyName) === expectedValue;
}

function isMalformedJsonBodyError(error) {
  return Boolean(
    error instanceof SyntaxError &&
      hasOwnDataPropertyValue(error, 'status', 400) &&
      hasOwnDataPropertyValue(error, 'type', 'entity.parse.failed')
  );
}

function isJsonBodyTooLargeError(error) {
  return Boolean(
    (hasOwnDataPropertyValue(error, 'status', 413) ||
      hasOwnDataPropertyValue(error, 'statusCode', 413)) &&
      hasOwnDataPropertyValue(error, 'type', 'entity.too.large')
  );
}

function isJsonBodyUnsupportedEncodingError(error) {
  return Boolean(
    (hasOwnDataPropertyValue(error, 'status', 415) ||
      hasOwnDataPropertyValue(error, 'statusCode', 415)) &&
      (hasOwnDataPropertyValue(error, 'type', 'encoding.unsupported') ||
        hasOwnDataPropertyValue(error, 'type', 'charset.unsupported'))
  );
}

function handleJsonBodyError(error, req, res, next) {
  if (isMalformedJsonBodyError(error)) {
    return res.status(400).json({ error: INVALID_JSON_REQUEST_BODY_ERROR });
  }

  if (isJsonBodyTooLargeError(error)) {
    return res.status(413).json({ error: JSON_REQUEST_BODY_TOO_LARGE_ERROR });
  }

  if (isJsonBodyUnsupportedEncodingError(error)) {
    return res.status(415).json({ error: JSON_REQUEST_BODY_UNSUPPORTED_ENCODING_ERROR });
  }

  return next(error);
}

function isObjectLike(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function hasInheritedBodyProperty(req) {
  let prototype = Object.getPrototypeOf(req);

  while (prototype !== null) {
    if (Object.getOwnPropertyDescriptor(prototype, 'body')) {
      return true;
    }

    prototype = Object.getPrototypeOf(prototype);
  }

  return false;
}

function describeBodyProperty(req) {
  if (!isObjectLike(req)) {
    return { kind: 'absent' };
  }

  const descriptor = Object.getOwnPropertyDescriptor(req, 'body');

  if (!descriptor) {
    return hasInheritedBodyProperty(req)
      ? { enumerable: false, kind: 'unsafe' }
      : { kind: 'absent' };
  }

  if (!Object.hasOwn(descriptor, 'value')) {
    return { enumerable: descriptor.enumerable, kind: 'unsafe' };
  }

  return { body: descriptor.value, kind: 'data' };
}

function shadowUnsafeBody(req, enumerable) {
  try {
    Object.defineProperty(req, 'body', {
      configurable: true,
      enumerable,
      value: undefined,
      writable: true,
    });
    return true;
  } catch {
    // Non-extensible or non-configurable request objects cannot be sanitized
    // here without risking accessor invocation.
    return false;
  }
}

function rejectJsonArrayBody(req, res, next) {
  // Express' JSON parser keeps strict parsing enabled by default, so primitive
  // JSON bodies are rejected as malformed before this parsed-body shape guard.
  const bodyProperty = describeBodyProperty(req);

  if (bodyProperty.kind === 'unsafe') {
    if (!shadowUnsafeBody(req, bodyProperty.enumerable)) {
      return res.status(400).json({ error: JSON_REQUEST_BODY_ARRAY_ERROR });
    }

    return next();
  }

  if (bodyProperty.kind === 'absent') {
    return next();
  }

  const body = bodyProperty.body;

  if (Array.isArray(body)) {
    return res.status(400).json({ error: JSON_REQUEST_BODY_ARRAY_ERROR });
  }

  if (body !== null && typeof body === 'object') {
    // Shallow top-level defense against Object.prototype pollution leaking
    // inherited fields into route handlers.
    Object.setPrototypeOf(body, null);
  }

  return next();
}

module.exports = {
  INVALID_JSON_REQUEST_BODY_ERROR,
  JSON_BODY_LIMIT,
  JSON_REQUEST_BODY_ARRAY_ERROR,
  JSON_REQUEST_BODY_TOO_LARGE_ERROR,
  JSON_REQUEST_BODY_UNSUPPORTED_ENCODING_ERROR,
  createJsonBodyParser,
  handleJsonBodyError,
  handleMalformedJsonBody: handleJsonBodyError,
  isJsonBodyTooLargeError,
  isJsonBodyUnsupportedEncodingError,
  isMalformedJsonBodyError,
  rejectJsonArrayBody,
};
