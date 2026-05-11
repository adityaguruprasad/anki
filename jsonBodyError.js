const INVALID_JSON_REQUEST_BODY_ERROR = 'Invalid JSON request body';
const JSON_REQUEST_BODY_TOO_LARGE_ERROR = 'JSON request body too large';

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
  JSON_REQUEST_BODY_TOO_LARGE_ERROR,
  handleJsonBodyError,
  handleMalformedJsonBody: handleJsonBodyError,
  isJsonBodyTooLargeError,
  isMalformedJsonBodyError,
};
