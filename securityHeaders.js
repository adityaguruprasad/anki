const DEFAULT_SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
});
// Keep the production HSTS default conservative: subdomain and preload readiness
// depends on the deployment, so the built-in policy is max-age only.
const STRICT_TRANSPORT_SECURITY_HEADER = 'max-age=15552000';
const PRODUCTION_SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY_HEADER,
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

function isProductionEnvironment(config = process.env) {
  return config?.NODE_ENV === 'production';
}

function buildSecurityHeaders(options, config = process.env) {
  validateOptions(options);

  const headers = { ...DEFAULT_SECURITY_HEADERS };
  if (isProductionEnvironment(config)) {
    Object.assign(headers, PRODUCTION_SECURITY_HEADERS);
  }

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

function createSecurityHeadersMiddleware(options, config = process.env) {
  const headers = buildSecurityHeaders(options, config);

  return function securityHeadersMiddleware(req, res, next) {
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }

    next();
  };
}

module.exports = {
  DEFAULT_SECURITY_HEADERS,
  PRODUCTION_SECURITY_HEADERS,
  STRICT_TRANSPORT_SECURITY_HEADER,
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
};
