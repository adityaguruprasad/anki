const INTERNAL_SERVER_ERROR = 'Internal server error';

function handleApiError(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);
  return res.status(500).json({ error: INTERNAL_SERVER_ERROR });
}

module.exports = {
  INTERNAL_SERVER_ERROR,
  handleApiError,
};
