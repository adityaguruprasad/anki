const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAuthHeaders } = require('../authHeaders');
const { AUTH_TOKEN_MAX_LENGTH } = require('../authTokenValidation');

test('buildAuthHeaders builds a bearer header for a non-empty token', () => {
  assert.deepEqual(buildAuthHeaders('token-123'), {
    Authorization: 'Bearer token-123',
  });
});

test('buildAuthHeaders trims token values before building the header', () => {
  assert.deepEqual(buildAuthHeaders('  token-123  '), {
    Authorization: 'Bearer token-123',
  });
});

test('buildAuthHeaders accepts a max-length token', () => {
  const token = 'a'.repeat(AUTH_TOKEN_MAX_LENGTH);

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
    'abc.def ghi',
    'abc.def\tghi',
    'abc.def\nghi',
    'abc.def\rghi',
    'abc.def\u0000ghi',
    'abc.def\u007fghi',
    'a'.repeat(AUTH_TOKEN_MAX_LENGTH + 1),
  ]) {
    assert.deepEqual(
      buildAuthHeaders(token),
      {},
      `Expected token ${JSON.stringify(token.slice(0, 24))} to be rejected`
    );
  }
});

test('buildAuthHeaders reads a token from a storage-like object', () => {
  const storage = {
    getItem(key) {
      assert.equal(key, 'token');
      return 'stored-token';
    },
  };

  assert.deepEqual(buildAuthHeaders(storage), {
    Authorization: 'Bearer stored-token',
  });
});

test('buildAuthHeaders reads a token from a getter function', () => {
  assert.deepEqual(buildAuthHeaders(() => 'getter-token'), {
    Authorization: 'Bearer getter-token',
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
