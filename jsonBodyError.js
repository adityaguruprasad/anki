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

function isMalformedJsonBodyError(error) {
  return Boolean(
    error instanceof SyntaxError &&
      error.status === 400 &&
      error.type === 'entity.parse.failed'
  );
}

function isJsonBodyTooLargeError(error) {
  return Boolean(
    error &&
      (error.status === 413 || error.statusCode === 413) &&
      error.type === 'entity.too.large'
  );
}

function isJsonBodyUnsupportedEncodingError(error) {
  return Boolean(
    error &&
      (error.status === 415 || error.statusCode === 415) &&
      (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported')
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

function rejectJsonArrayBody(req, res, next) {
  // Express' JSON parser keeps strict parsing enabled by default, so primitive
  // JSON bodies are rejected as malformed before this parsed-body shape guard.
  if (Array.isArray(req?.body)) {
    return res.status(400).json({ error: JSON_REQUEST_BODY_ARRAY_ERROR });
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
