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

function withImpossibleBase64UrlLength(part) {
  const suffixLength = (1 - (part.length % 4) + 4) % 4 || 4;
  const value = `${part}${'a'.repeat(suffixLength)}`;

  assert.equal(value.length % 4, 1);
  return value;
}

function withObjectPrototypeProperties(properties, callback) {
  const descriptors = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      {
        value,
        writable: true,
      },
    ])
  );

  withObjectPrototypeDescriptors(descriptors, callback);
}

function withObjectPrototypeDescriptors(descriptors, callback) {
  const previousDescriptors = new Map();
  const modifiedKeys = [];

  try {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      previousDescriptors.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: true,
        ...descriptor,
      });
      modifiedKeys.push(key);
    }

    callback();
  } finally {
    for (const key of modifiedKeys.reverse()) {
      const descriptor = previousDescriptors.get(key);
      if (descriptor) {
        Object.defineProperty(Object.prototype, key, descriptor);
      } else {
        delete Object.prototype[key];
      }
    }
  }
}

function withThrowingObjectPrototypeClaimGetters(callback) {
  const getterInvocations = [];
  const descriptors = Object.fromEntries(
    ['alg', 'typ', 'userId', 'iat', 'exp'].map((key) => [
      key,
      {
        get() {
          getterInvocations.push(key);
          throw new Error(`Unexpected Object.prototype.${key} getter invocation`);
        },
      },
    ])
  );

  withObjectPrototypeDescriptors(descriptors, () => {
    callback(getterInvocations);
  });
}

test('normalizeAuthToken accepts and trims compact JWTs with expected app claims', () => {
  const token = createCompactJwt();

  assert.equal(normalizeAuthToken(`  ${token}\n`), token);
});

test('normalizeAuthToken accepts own JWT claims when Object.prototype is polluted', () => {
  const token = createCompactJwt();

  withObjectPrototypeProperties({
    alg: 'HS512',
    typ: 'JWS',
    userId: MAX_POSTGRES_SERIAL_ID + 1,
    iat: -1,
    exp: 0,
  }, () => {
    assert.equal(normalizeAuthToken(token), token);
  });
});

test('normalizeAuthToken ignores inherited accessor-backed JWT claim getters', () => {
  const validOwnClaimToken = createCompactJwt();
  const inheritedOnlyToken = [
    base64UrlJson({}),
    base64UrlJson({}),
    'signature0',
  ].join('.');
  const inheritedPayloadClaimToken = [
    base64UrlJson({ alg: 'HS256', typ: 'JWT' }),
    base64UrlJson({}),
    'signature0',
  ].join('.');

  withThrowingObjectPrototypeClaimGetters((getterInvocations) => {
    assert.equal(normalizeAuthToken(validOwnClaimToken), validOwnClaimToken);
    assert.equal(normalizeAuthToken(inheritedOnlyToken), null);
    assert.equal(normalizeAuthToken(inheritedPayloadClaimToken), null);
    assert.deepEqual(getterInvocations, []);
  });
});

test('normalizeAuthToken rejects compact JWTs with alg-only headers missing typ', () => {
  const token = [
    base64UrlJson({ alg: 'HS256' }),
    base64UrlJson({ userId: 42, iat: 1000, exp: 2000 }),
    'signature0',
  ].join('.');

  assert.equal(normalizeAuthToken(token), null);
});

test('normalizeAuthToken rejects compact JWTs that rely on inherited required claims', () => {
  withObjectPrototypeProperties({
    alg: 'HS256',
    typ: 'JWT',
    userId: 42,
    iat: 1000,
    exp: 2000,
  }, () => {
    for (const token of [
      [
        base64UrlJson({ typ: 'JWT' }),
        base64UrlJson({ userId: 42, iat: 1000, exp: 2000 }),
        'signature0',
      ].join('.'),
      [
        base64UrlJson({ alg: 'HS256' }),
        base64UrlJson({ userId: 42, iat: 1000, exp: 2000 }),
        'signature0',
      ].join('.'),
      [
        base64UrlJson({ alg: 'HS256', typ: 'JWT' }),
        base64UrlJson({ iat: 1000, exp: 2000 }),
        'signature0',
      ].join('.'),
      [
        base64UrlJson({ alg: 'HS256', typ: 'JWT' }),
        base64UrlJson({ userId: 42, exp: 2000 }),
        'signature0',
      ].join('.'),
      [
        base64UrlJson({ alg: 'HS256', typ: 'JWT' }),
        base64UrlJson({ userId: 42, iat: 1000 }),
        'signature0',
      ].join('.'),
    ]) {
      assert.equal(normalizeAuthToken(token), null, token);
    }
  });
});

test('normalizeAuthToken rejects compact JWTs with unsupported payload fields', () => {
  for (const token of [
    createCompactJwt({ payload: { role: 'admin' } }),
    createCompactJwt({ payload: { email: 'ada@example.com' } }),
    createCompactJwt({ payload: { password_hash: 'stored-hash' } }),
  ]) {
    assert.equal(normalizeAuthToken(token), null, token);
  }
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

test('normalizeAuthToken rejects compact segments with impossible base64url lengths', () => {
  const validToken = createCompactJwt();
  const [encodedHeader, encodedPayload, signature] = validToken.split('.');

  for (const parts of [
    [withImpossibleBase64UrlLength(encodedHeader), encodedPayload, signature],
    [encodedHeader, withImpossibleBase64UrlLength(encodedPayload), signature],
    [encodedHeader, encodedPayload, withImpossibleBase64UrlLength(signature)],
  ]) {
    const token = parts.join('.');

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

test('normalizeAuthToken rejects tokens that do not match API-issued JWT headers and claims', () => {
  for (const token of [
    createCompactJwt({ header: { kid: 'active-key' } }),
    createCompactJwt({ header: { x5c: ['certificate'] } }),
    createCompactJwt({ header: { alg: 'HS512' } }),
    createCompactJwt({ header: { alg: 'none' } }),
    createCompactJwt({ header: { typ: undefined } }),
    createCompactJwt({ header: { typ: 'JWS' } }),
    createCompactJwt({ header: { crit: ['exp'] } }),
    createCompactJwt({ payload: { userId: undefined } }),
    createCompactJwt({ payload: { userId: 0 } }),
    createCompactJwt({ payload: { userId: -1 } }),
    createCompactJwt({ payload: { userId: 1.5 } }),
    createCompactJwt({ payload: { userId: String(42) } }),
    createCompactJwt({ payload: { userId: MAX_POSTGRES_SERIAL_ID + 1 } }),
    createCompactJwt({ payload: { iat: undefined } }),
    createCompactJwt({ payload: { iat: -1 } }),
    createCompactJwt({ payload: { iat: 1.5 } }),
    createCompactJwt({ payload: { iat: String(1000) } }),
    createCompactJwt({ payload: { iat: Number.MAX_SAFE_INTEGER + 1 } }),
    createCompactJwt({ payload: { iat: 2000 } }),
    createCompactJwt({ payload: { iat: 2001 } }),
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
