const DEFAULT_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
});

function isPlainObject(value) {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOptions(options) {
  if (options == null) {
    return;
  }

  if (!isPlainObject(options)) {
    throw new TypeError('security header options must be a flat header override object');
  }
}

function validateHeaderValue(name, value) {
  if (value === false || value == null) {
    return;
  }

  if (typeof value === 'object' || typeof value === 'function') {
    throw new TypeError(`security header override for ${name} must be a primitive value`);
  }
}

function buildSecurityHeaders(options) {
  validateOptions(options);

  const headers = { ...DEFAULT_SECURITY_HEADERS };
  const overrides = options || {};

  for (const [name, value] of Object.entries(overrides)) {
    validateHeaderValue(name, value);

    if (value === false || value == null) {
      delete headers[name];
      continue;
    }

    headers[name] = String(value);
  }

  return Object.freeze(headers);
}

function createSecurityHeadersMiddleware(options) {
  const headers = buildSecurityHeaders(options);

  return function securityHeadersMiddleware(req, res, next) {
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }

    next();
  };
}

module.exports = {
  DEFAULT_SECURITY_HEADERS,
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
};
