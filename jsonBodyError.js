const INVALID_JSON_REQUEST_BODY_ERROR = 'Invalid JSON request body';
const JSON_REQUEST_BODY_TOO_LARGE_ERROR = 'JSON request body too large';
// Above the current largest intended card payload, below Express' broad default.
const JSON_BODY_LIMIT = '96kb';

function createJsonBodyParser(expressModule) {
  if (!expressModule || typeof expressModule.json !== 'function') {
    throw new TypeError('createJsonBodyParser requires an Express module with a json method');
  }

  return expressModule.json({ limit: JSON_BODY_LIMIT });
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

function handleJsonBodyError(error, req, res, next) {
  if (isMalformedJsonBodyError(error)) {
    return res.status(400).json({ error: INVALID_JSON_REQUEST_BODY_ERROR });
  }

  if (isJsonBodyTooLargeError(error)) {
    return res.status(413).json({ error: JSON_REQUEST_BODY_TOO_LARGE_ERROR });
  }

  return next(error);
}

module.exports = {
  INVALID_JSON_REQUEST_BODY_ERROR,
  JSON_BODY_LIMIT,
  JSON_REQUEST_BODY_TOO_LARGE_ERROR,
  createJsonBodyParser,
  handleJsonBodyError,
  handleMalformedJsonBody: handleJsonBodyError,
  isJsonBodyTooLargeError,
  isMalformedJsonBodyError,
};
