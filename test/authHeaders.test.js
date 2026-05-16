const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAuthHeaders } = require('../authHeaders');
const {
  createCompactJwt,
  createMaxLengthCompactJwt,
} = require('./authTokenTestHelpers');

test('buildAuthHeaders builds a bearer header for a compact JWT token', () => {
  const token = createCompactJwt();

  assert.deepEqual(buildAuthHeaders(token), {
    Authorization: `Bearer ${token}`,
  });
});

test('buildAuthHeaders trims token values before building the header', () => {
  const token = createCompactJwt();

  assert.deepEqual(buildAuthHeaders(`  ${token}  `), {
    Authorization: `Bearer ${token}`,
  });
});

test('buildAuthHeaders accepts a max-length compact JWT token', () => {
  const token = createMaxLengthCompactJwt();

  assert.deepEqual(buildAuthHeaders(token), {
    Authorization: `Bearer ${token}`,
  });
});

test('buildAuthHeaders returns empty headers for missing and blank tokens', () => {
  assert.deepEqual(buildAuthHeaders(null), {});
  assert.deepEqual(buildAuthHeaders(undefined), {});
  assert.deepEqual(buildAuthHeaders(''), {});
  assert.deepEqual(buildAuthHeaders('   '), {});
});

test('buildAuthHeaders returns empty headers for unsafe token strings', () => {
  for (const token of [
    'token-123',
    'abc.def.ghi',
    'abc.def ghi',
    'abc.def\tghi',
    'abc.def\nghi',
    'abc.def\rghi',
    'abc.def\u0000ghi',
    'abc.def\u007fghi',
    `${createMaxLengthCompactJwt()}a`,
  ]) {
    assert.deepEqual(
      buildAuthHeaders(token),
      {},
      `Expected token ${JSON.stringify(token.slice(0, 24))} to be rejected`
    );
  }
});

test('buildAuthHeaders reads a token from a storage-like object', () => {
  const token = createCompactJwt();
  const storage = {
    getItem(key) {
      assert.equal(key, 'token');
      return token;
    },
  };

  assert.deepEqual(buildAuthHeaders(storage), {
    Authorization: `Bearer ${token}`,
  });
});

test('buildAuthHeaders reads a token from a getter function', () => {
  const token = createCompactJwt();

  assert.deepEqual(buildAuthHeaders(() => token), {
    Authorization: `Bearer ${token}`,
  });
});

test('buildAuthHeaders returns empty headers when token lookup throws', () => {
  assert.deepEqual(buildAuthHeaders(() => {
    throw new Error('storage unavailable');
  }), {});

  assert.deepEqual(buildAuthHeaders({
    getItem() {
      throw new Error('storage unavailable');
    },
  }), {});
});
