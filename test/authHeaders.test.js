const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAuthHeaders } = require('../authHeaders');
const {
  base64UrlJson,
  createCompactJwt,
  createMaxLengthCompactJwt,
} = require('./authTokenTestHelpers');

function restoreGlobalProperty(propertyName, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, propertyName, descriptor);
    return;
  }

  delete globalThis[propertyName];
}

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

test('buildAuthHeaders does not send tokens with unsupported JWT header fields', () => {
  assert.deepEqual(buildAuthHeaders(createCompactJwt({ header: { kid: 'active-key' } })), {});
  assert.deepEqual(buildAuthHeaders(createCompactJwt({ header: { crit: ['exp'] } })), {});
});

test('buildAuthHeaders does not send compact JWTs with alg-only headers missing typ', () => {
  const token = [
    base64UrlJson({ alg: 'HS256' }),
    base64UrlJson({ userId: 42, iat: 1000, exp: 2000 }),
    'signature0',
  ].join('.');

  assert.deepEqual(buildAuthHeaders(token), {});
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
    createCompactJwt({ signature: 'a' }),
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

test('buildAuthHeaders reads a token from an accepted Web Storage prototype method', () => {
  const token = createCompactJwt();
  const previousStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Storage');

  function Storage() {}

  Object.defineProperty(Storage.prototype, 'getItem', {
    configurable: true,
    value(key) {
      assert.equal(key, 'token');
      return this.token;
    },
  });

  Object.defineProperty(globalThis, 'Storage', {
    configurable: true,
    value: Storage,
    writable: true,
  });

  try {
    const storage = Object.create(Storage.prototype);
    storage.token = token;

    assert.deepEqual(buildAuthHeaders(storage), {
      Authorization: `Bearer ${token}`,
    });
  } finally {
    restoreGlobalProperty('Storage', previousStorageDescriptor);
  }
});

test('buildAuthHeaders reads Web Storage getItem through an extra prototype layer without invoking inherited accessors', () => {
  const token = createCompactJwt();
  const previousStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Storage');
  let getterCalls = 0;

  function Storage() {}
  function LayeredStorage() {}

  Object.defineProperty(Storage.prototype, 'getItem', {
    configurable: true,
    value(key) {
      assert.equal(key, 'token');
      return this.token;
    },
  });

  LayeredStorage.prototype = Object.create(Storage.prototype);
  Object.defineProperty(LayeredStorage.prototype, 'constructor', {
    configurable: true,
    value: LayeredStorage,
  });
  Object.defineProperty(LayeredStorage.prototype, 'getItem', {
    configurable: true,
    get() {
      getterCalls += 1;
      return () => token;
    },
  });

  Object.defineProperty(globalThis, 'Storage', {
    configurable: true,
    value: Storage,
    writable: true,
  });

  try {
    const storage = new LayeredStorage();
    storage.token = token;

    assert.deepEqual(buildAuthHeaders(storage), {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(getterCalls, 0);
  } finally {
    restoreGlobalProperty('Storage', previousStorageDescriptor);
  }
});

test('buildAuthHeaders ignores inherited getItem on plain objects without invoking it', () => {
  const token = createCompactJwt();
  let getItemCalls = 0;
  const storage = Object.create({
    getItem() {
      getItemCalls += 1;
      return token;
    },
  });

  assert.deepEqual(buildAuthHeaders(storage), {});
  assert.equal(getItemCalls, 0);
});

test('buildAuthHeaders ignores accessor-backed getItem properties without invoking getters', () => {
  const token = createCompactJwt();
  let getterCalls = 0;
  const ownAccessorStorage = {};
  Object.defineProperty(ownAccessorStorage, 'getItem', {
    configurable: true,
    get() {
      getterCalls += 1;
      return () => token;
    },
  });

  const inheritedAccessorPrototype = {};
  Object.defineProperty(inheritedAccessorPrototype, 'getItem', {
    configurable: true,
    get() {
      getterCalls += 1;
      return () => token;
    },
  });

  assert.deepEqual(buildAuthHeaders(ownAccessorStorage), {});
  assert.deepEqual(buildAuthHeaders(Object.create(inheritedAccessorPrototype)), {});
  assert.equal(getterCalls, 0);
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
