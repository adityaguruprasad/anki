const { AUTH_TOKEN_MAX_LENGTH } = require('../authTokenValidation');

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createCompactJwt(options = {}) {
  const {
    header = {},
    payload = {},
    signature = 'signature',
  } = options;

  return [
    base64UrlJson({
      alg: 'HS256',
      typ: 'JWT',
      ...header,
    }),
    base64UrlJson({
      userId: 42,
      iat: 1000,
      exp: 2000,
      ...payload,
    }),
    signature,
  ].join('.');
}

function createMaxLengthCompactJwt() {
  // Keep this prefix mirrored to the validator's required header and payload
  // claims so max-length boundary tests isolate length handling.
  const prefix = [
    base64UrlJson({ alg: 'HS256', typ: 'JWT' }),
    base64UrlJson({ userId: 42, iat: 1000, exp: 2000 }),
    '',
  ].join('.');
  const signatureLength = AUTH_TOKEN_MAX_LENGTH - prefix.length;

  if (signatureLength < 1) {
    throw new Error('Compact JWT fixture prefix exceeds max token length');
  }

  return `${prefix}${'a'.repeat(signatureLength)}`;
}

module.exports = {
  base64UrlJson,
  createCompactJwt,
  createMaxLengthCompactJwt,
};
