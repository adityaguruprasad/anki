const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTH_TOKEN_MAX_LENGTH,
  normalizeAuthToken,
} = require('../authTokenValidation');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');
const {
  base64UrlJson,
  createCompactJwt,
  createMaxLengthCompactJwt,
} = require('./authTokenTestHelpers');

test('normalizeAuthToken accepts and trims compact JWTs with expected app claims', () => {
  const token = createCompactJwt();

  assert.equal(normalizeAuthToken(`  ${token}\n`), token);
});

test('normalizeAuthToken accepts a max-length compact JWT envelope', () => {
  const token = createMaxLengthCompactJwt();

  assert.equal(token.length, AUTH_TOKEN_MAX_LENGTH);
  assert.equal(normalizeAuthToken(token), token);
});

test('normalizeAuthToken rejects missing, blank, and non-string tokens', () => {
  for (const token of [undefined, null, '', '   ', 42, {}, []]) {
    assert.equal(normalizeAuthToken(token), null);
  }
});

test('normalizeAuthToken rejects non-compact and unsafe token strings', () => {
  const validToken = createCompactJwt();
  const [encodedHeader, encodedPayload, signature] = validToken.split('.');

  for (const token of [
    'token-123',
    `${encodedHeader}.${encodedPayload}`,
    `${encodedHeader}.${encodedPayload}.${signature}.extra`,
    `${encodedHeader}..${signature}`,
    `.${encodedPayload}.${signature}`,
    `${encodedHeader}.${encodedPayload}.`,
    `${encodedHeader}.${encodedPayload}.sig=nature`,
    `${encodedHeader}.${encodedPayload}.sig nature`,
    `${encodedHeader}.${encodedPayload}.sig\nnature`,
    'a'.repeat(AUTH_TOKEN_MAX_LENGTH + 1),
  ]) {
    assert.equal(normalizeAuthToken(token), null, token);
  }
});

test('normalizeAuthToken rejects compact strings without JSON JWT envelope data', () => {
  for (const token of [
    'abc.def.ghi',
    `${base64UrlJson(null)}.${base64UrlJson({ userId: 42, exp: 2000 })}.signature`,
    `${base64UrlJson({ alg: 'HS256' })}.${base64UrlJson(null)}.signature`,
    `${base64UrlJson(['HS256'])}.${base64UrlJson({ userId: 42, exp: 2000 })}.signature`,
    `${base64UrlJson({ alg: 'HS256' })}.${base64UrlJson(['payload'])}.signature`,
  ]) {
    assert.equal(normalizeAuthToken(token), null, token);
  }
});

test('normalizeAuthToken rejects tokens that do not match API-issued JWT claims', () => {
  for (const token of [
    createCompactJwt({ header: { alg: 'HS512' } }),
    createCompactJwt({ header: { alg: 'none' } }),
    createCompactJwt({ payload: { userId: undefined } }),
    createCompactJwt({ payload: { userId: 0 } }),
    createCompactJwt({ payload: { userId: -1 } }),
    createCompactJwt({ payload: { userId: 1.5 } }),
    createCompactJwt({ payload: { userId: String(42) } }),
    createCompactJwt({ payload: { userId: MAX_POSTGRES_SERIAL_ID + 1 } }),
    createCompactJwt({ payload: { exp: undefined } }),
    createCompactJwt({ payload: { exp: 0 } }),
    createCompactJwt({ payload: { exp: -1 } }),
    createCompactJwt({ payload: { exp: 1.5 } }),
    createCompactJwt({ payload: { exp: String(2000) } }),
    createCompactJwt({ payload: { exp: Number.MAX_SAFE_INTEGER + 1 } }),
  ]) {
    assert.equal(normalizeAuthToken(token), null, token);
  }
});
