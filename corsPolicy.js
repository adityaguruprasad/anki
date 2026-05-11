const CORS_ALLOWED_ORIGINS_ENV = 'CORS_ALLOWED_ORIGINS';
const CORS_ORIGIN_REJECTED_CODE = 'CORS_ORIGIN_REJECTED';
const CORS_ORIGIN_REJECTED_ERROR = 'CORS origin is not allowed';

function normalizeAllowedOrigins(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsOriginRejectedError() {
  const error = new Error(CORS_ORIGIN_REJECTED_ERROR);
  error.code = CORS_ORIGIN_REJECTED_CODE;
  error.status = 403;
  return error;
}

function isCorsOriginRejectedError(error) {
  return Boolean(error && error.code === CORS_ORIGIN_REJECTED_CODE);
}

function buildCorsOptions(config = process.env) {
  const allowedOrigins = normalizeAllowedOrigins(config[CORS_ALLOWED_ORIGINS_ENV]);

  if (allowedOrigins.length === 0) {
    return {};
  }

  const allowedOriginSet = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      if (!origin || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      callback(createCorsOriginRejectedError());
    },
  };
}

function handleCorsError(error, req, res, next) {
  if (isCorsOriginRejectedError(error)) {
    return res.status(403).json({ error: CORS_ORIGIN_REJECTED_ERROR });
  }

  return next(error);
}

module.exports = {
  CORS_ALLOWED_ORIGINS_ENV,
  CORS_ORIGIN_REJECTED_CODE,
  CORS_ORIGIN_REJECTED_ERROR,
  buildCorsOptions,
  handleCorsError,
  isCorsOriginRejectedError,
  normalizeAllowedOrigins,
};
