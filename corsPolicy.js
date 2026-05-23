const CORS_ALLOWED_ORIGINS_ENV = 'CORS_ALLOWED_ORIGINS';
const CORS_ORIGIN_REJECTED_CODE = 'CORS_ORIGIN_REJECTED';
const CORS_ORIGIN_REJECTED_ERROR = 'CORS origin is not allowed';

function normalizeAllowedOrigins(value) {
  return getConfiguredAllowedOriginEntries(value)
    .map(normalizeAllowedOrigin)
    .filter(Boolean);
}

function getConfiguredAllowedOriginEntries(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeAllowedOrigin(origin) {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return null;
  }

  const hasOriginOnlyPath = /^\/+$/.test(parsedOrigin.pathname);
  const hasNoNonOriginParts = (
    parsedOrigin.username === ''
    && parsedOrigin.password === ''
    && parsedOrigin.search === ''
    && parsedOrigin.hash === ''
  );

  if (
    (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:')
    && hasOriginOnlyPath
    && hasNoNonOriginParts
  ) {
    return parsedOrigin.origin;
  }

  return null;
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

function getOwnConfigValue(config, fieldName) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  // Accept only own data properties; accessors are ignored without invoking getters.
  const descriptor = Object.getOwnPropertyDescriptor(config, fieldName);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function buildCorsOptions(config) {
  const environmentConfig = arguments.length === 0 ? process.env : config;
  const configuredAllowedOriginEntries = getConfiguredAllowedOriginEntries(
    getOwnConfigValue(environmentConfig, CORS_ALLOWED_ORIGINS_ENV)
  );
  const nodeEnv = getOwnConfigValue(environmentConfig, 'NODE_ENV');
  const allowedOrigins = configuredAllowedOriginEntries
    .map(normalizeAllowedOrigin)
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    if (nodeEnv === 'production' || configuredAllowedOriginEntries.length > 0) {
      return {
        origin(origin, callback) {
          if (!origin) {
            callback(null, true);
            return;
          }

          callback(createCorsOriginRejectedError());
        },
      };
    }

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
