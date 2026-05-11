const INVALID_JSON_REQUEST_BODY_ERROR = 'Invalid JSON request body';

function isMalformedJsonBodyError(error) {
  return Boolean(
    error instanceof SyntaxError &&
      error.status === 400 &&
      error.type === 'entity.parse.failed'
  );
}

function handleMalformedJsonBody(error, req, res, next) {
  if (isMalformedJsonBodyError(error)) {
    return res.status(400).json({ error: INVALID_JSON_REQUEST_BODY_ERROR });
  }

  return next(error);
}

module.exports = {
  INVALID_JSON_REQUEST_BODY_ERROR,
  handleMalformedJsonBody,
  isMalformedJsonBodyError,
};
