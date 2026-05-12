const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_USERNAME_MAX_LENGTH,
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_DEV_JWT_SECRET,
  JWT_TOKEN_TOO_LONG_ERROR,
  MAX_JWT_TOKEN_LENGTH,
  createAuthHandlers,
  extractBearerToken,
  resolveJwtExpiresInSeconds,
  resolveJwtSecret,
  signToken,
  verifyToken,
} = require('../auth');

function createEmailWithLength(totalLength) {
  const domain = '@example.com';
  return `${'a'.repeat(totalLength - domain.length)}${domain}`;
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
}

function createDb(results) {
  let index = 0;
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      const next = results[index++];
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
}

function createUniqueViolation(constraint) {
  const error = new Error('duplicate key value violates unique constraint');
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

function createPasswordHasher({ compareResult = true } = {}) {
  return {
    hashCalls: [],
    compareCalls: [],
    async hash(password, rounds) {
      this.hashCalls.push({ password, rounds });
      return `hashed:${password}`;
    },
    async compare(password, passwordHash) {
      this.compareCalls.push({ password, passwordHash });
      return compareResult;
    },
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signRawJwt(header, payload, secret) {
  const body = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

test('register uses injected db and returns a signed token with inserted user id', async () => {
  const db = createDb([{ rowCount: 1, rows: [{ id: 42 }] }]);
  const passwordHasher = createPasswordHasher();
  const { register, authenticateToken } = createAuthHandlers(db, {
    jwtSecret: 'unit-test-secret',
    passwordHasher,
  });
  const req = {
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password: 'correct horse battery staple',
    },
  };
  const res = createRes();

  await register(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(typeof res.body.token, 'string');
  assert.deepEqual(passwordHasher.hashCalls, [
    { password: 'correct horse battery staple', rounds: 10 },
  ]);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /INSERT INTO users/i);
  assert.deepEqual(db.calls[0].params, [
    'ada',
    'ada@example.com',
    'hashed:correct horse battery staple',
  ]);

  const authReq = { headers: { authorization: `Bearer ${res.body.token}` } };
  let nextCalled = false;
  authenticateToken(authReq, createRes(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(authReq.user.userId, 42);
});

test('register rejects invalid input before hashing or querying', async (t) => {
  const cases = [
    {
      name: 'blank username',
      body: { username: '   ', email: 'ada@example.com', password: 'valid-pass' },
      error: 'Username is required',
    },
    {
      name: 'username too long',
      body: {
        username: 'a'.repeat(AUTH_USERNAME_MAX_LENGTH + 1),
        email: 'ada@example.com',
        password: 'valid-pass',
      },
      error: `Username must be ${AUTH_USERNAME_MAX_LENGTH} characters or fewer`,
    },
    {
      name: 'invalid email',
      body: { username: 'ada', email: 'ada@@example.com', password: 'valid-pass' },
      error: 'Valid email is required',
    },
    {
      name: 'email too long',
      body: {
        username: 'ada',
        email: `  ${createEmailWithLength(AUTH_EMAIL_MAX_LENGTH + 1).toUpperCase()}  `,
        password: 'valid-pass',
      },
      error: `Email must be ${AUTH_EMAIL_MAX_LENGTH} characters or fewer`,
    },
    {
      name: 'short password',
      body: { username: 'ada', email: 'ada@example.com', password: 'short' },
      error: 'Password must be at least 8 characters',
    },
    {
      name: 'password beyond bcrypt byte limit',
      body: { username: 'ada', email: 'ada@example.com', password: 'é'.repeat(37) },
      error: `Password must be ${AUTH_PASSWORD_MAX_BYTES} UTF-8 bytes or fewer`,
    },
  ];

  for (const { name, body, error } of cases) {
    await t.test(name, async () => {
      const db = createDb([]);
      const passwordHasher = createPasswordHasher();
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'invalid-register-secret',
        passwordHasher,
      });
      const res = createRes();

      await register({ body }, res);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error });
      assert.deepEqual(passwordHasher.hashCalls, []);
      assert.deepEqual(db.calls, []);
    });
  }
});

test('register accepts a password exactly at the bcrypt byte limit', async () => {
  const password = 'a'.repeat(AUTH_PASSWORD_MAX_BYTES);
  const db = createDb([{ rowCount: 1, rows: [{ id: 44 }] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'boundary-register-secret',
    passwordHasher,
  });
  const res = createRes();

  await register({
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password,
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(passwordHasher.hashCalls, [{ password, rounds: 10 }]);
  assert.equal(db.calls.length, 1);
});

test('register trims username and normalizes email before storing', async () => {
  const db = createDb([{ rowCount: 1, rows: [{ id: 43 }] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'normal-register-secret',
    passwordHasher,
  });
  const req = {
    body: {
      username: '  Ada Lovelace  ',
      email: '  ADA@Example.COM  ',
      password: 'correct horse battery staple',
    },
  };
  const res = createRes();

  await register(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(db.calls[0].params, [
    'Ada Lovelace',
    'ada@example.com',
    'hashed:correct horse battery staple',
  ]);
});

test('register returns 409 for duplicate username or email unique violations without minting a token', async (t) => {
  const cases = [
    { name: 'duplicate username', constraint: 'users_username_key' },
    { name: 'duplicate email', constraint: 'users_email_key' },
  ];

  for (const { name, constraint } of cases) {
    await t.test(name, async () => {
      const db = createDb([createUniqueViolation(constraint)]);
      const passwordHasher = createPasswordHasher();
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'duplicate-register-secret',
        passwordHasher,
      });
      const req = {
        body: {
          username: 'ada',
          email: 'ada@example.com',
          password: 'correct horse battery staple',
        },
      };
      const res = createRes();

      await register(req, res);

      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body, { error: 'Account already exists' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.hashCalls, [
        { password: 'correct horse battery staple', rounds: 10 },
      ]);
      assert.equal(db.calls.length, 1);
      assert.doesNotMatch(db.calls[0].sql, /ON\s+CONFLICT/i);
      assert.match(db.calls[0].sql, /RETURNING\s+id/i);
      assert.deepEqual(db.calls[0].params, [
        'ada',
        'ada@example.com',
        'hashed:correct horse battery staple',
      ]);
    });
  }
});

test('register keeps unrelated unique violations on the 500 registration failure path', async () => {
  const db = createDb([createUniqueViolation('users_future_unique_key')]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'unrelated-register-error-secret',
    passwordHasher,
  });
  const req = {
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password: 'correct horse battery staple',
    },
  };
  const res = createRes();

  await register(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error registering user' });
  assert.deepEqual(passwordHasher.hashCalls, [
    { password: 'correct horse battery staple', rounds: 10 },
  ]);
  assert.equal(db.calls.length, 1);
  assert.doesNotMatch(db.calls[0].sql, /ON\s+CONFLICT/i);
});

test('login accepts a password over the bcrypt byte limit and compares it unchanged', async () => {
  const password = `${'a'.repeat(AUTH_PASSWORD_MAX_BYTES)}🙂`;
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 77, email: 'grace@example.com', password_hash: 'stored-hash' }],
    },
  ]);
  const passwordHasher = createPasswordHasher();
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'login-test-secret',
    passwordHasher,
  });
  const req = { body: { email: 'grace@example.com', password } };
  const res = createRes();

  assert.equal(Buffer.byteLength(password, 'utf8'), AUTH_PASSWORD_MAX_BYTES + 4);

  await login(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].sql, 'SELECT id, email, password_hash FROM users WHERE email = $1');
  assert.doesNotMatch(db.calls[0].sql, /SELECT\s+\*/i);
  assert.deepEqual(db.calls[0].params, ['grace@example.com']);
  assert.deepEqual(passwordHasher.compareCalls, [
    { password, passwordHash: 'stored-hash' },
  ]);
  assert.equal(verifyToken(res.body.token, 'login-test-secret').userId, 77);
});

test('login rejects invalid input before querying or comparing', async (t) => {
  const cases = [
    {
      name: 'invalid email',
      body: { email: 'not-an-email', password: 's3cret' },
      error: 'Valid email is required',
    },
    {
      name: 'email too long',
      body: {
        email: `  ${createEmailWithLength(AUTH_EMAIL_MAX_LENGTH + 1).toUpperCase()}  `,
        password: 's3cret',
      },
      error: `Email must be ${AUTH_EMAIL_MAX_LENGTH} characters or fewer`,
    },
    {
      name: 'empty password',
      body: { email: 'grace@example.com', password: '' },
      error: 'Password is required',
    },
  ];

  for (const { name, body, error } of cases) {
    await t.test(name, async () => {
      const db = createDb([]);
      const passwordHasher = createPasswordHasher();
      const { login } = createAuthHandlers(db, {
        jwtSecret: 'invalid-login-secret',
        passwordHasher,
      });
      const res = createRes();

      await login({ body }, res);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error });
      assert.deepEqual(db.calls, []);
      assert.deepEqual(passwordHasher.compareCalls, []);
    });
  }
});

test('login normalizes email before credential lookup', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 78, email: 'grace@example.com', password_hash: 'stored-hash' }],
    },
  ]);
  const passwordHasher = createPasswordHasher();
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'normal-login-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: '  GRACE@Example.COM ', password: 's3cret' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(db.calls[0].params, ['grace@example.com']);
  assert.deepEqual(passwordHasher.compareCalls, [
    { password: 's3cret', passwordHash: 'stored-hash' },
  ]);
});

test('signToken adds exp and verifyToken rejects expired tokens', () => {
  const token = signToken({ userId: 101 }, 'expiry-secret', {
    now: 1000,
    expiresInSeconds: 60,
  });

  assert.deepEqual(verifyToken(token, 'expiry-secret', { now: 1059 }), {
    userId: 101,
    iat: 1000,
    exp: 1060,
  });
  assert.throws(() => verifyToken(token, 'expiry-secret', { now: 1060 }), /Token expired/);
});

test('signToken rejects expiration math that would produce an unsafe exp', () => {
  assert.throws(
    () =>
      signToken({ userId: 101 }, 'unsafe-exp-secret', {
        now: Number.MAX_SAFE_INTEGER,
        expiresInSeconds: 1,
      }),
    /Token expiration must be a positive safe integer/
  );
});

test('verifyToken rejects non-integer, string, and unsafe exp claims before expiry checks', () => {
  const invalidExpClaims = [
    { label: 'fractional', exp: 2000.5 },
    { label: 'string', exp: '2000' },
    { label: 'unsafe', exp: Number.MAX_SAFE_INTEGER + 1 },
    { label: 'zero', exp: 0 },
    { label: 'negative', exp: -1 },
  ];

  for (const { label, exp } of invalidExpClaims) {
    const token = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { userId: 101, iat: 1000, exp },
      'strict-exp-secret'
    );

    assert.throws(
      () => verifyToken(token, 'strict-exp-secret', { now: 1000 }),
      /Token expiration must be a positive safe integer/,
      label
    );
  }
});

test('verifyToken accepts positive integer userId claims as normalized numbers', () => {
  const validClaims = [
    { userId: 42, expected: 42 },
    { userId: '42', expected: 42 },
    { userId: ' 43 ', expected: 43 },
    { userId: String(Number.MAX_SAFE_INTEGER), expected: Number.MAX_SAFE_INTEGER },
  ];

  for (const { userId, expected } of validClaims) {
    const token = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { userId, iat: 1000, exp: 2000 },
      'numeric-user-secret'
    );

    assert.deepEqual(verifyToken(token, 'numeric-user-secret', { now: 1000 }), {
      userId: expected,
      iat: 1000,
      exp: 2000,
    });
  }
});

test('authenticateToken returns 403 for expired tokens', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'expired-auth-secret',
    passwordHasher: createPasswordHasher(),
  });
  const token = signToken({ userId: 102 }, 'expired-auth-secret', {
    now: Math.floor(Date.now() / 1000) - 2,
    expiresInSeconds: 1,
  });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('verifyToken rejects tokens without exp and non-HS256 algorithms', () => {
  const tokenWithoutExp = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    { userId: 103, iat: 1000 },
    'alg-secret'
  );
  const hs512Token = signRawJwt(
    { alg: 'HS512', typ: 'JWT' },
    { userId: 104, iat: 1000, exp: 2000 },
    'alg-secret'
  );

  assert.throws(
    () => verifyToken(tokenWithoutExp, 'alg-secret', { now: 1000 }),
    /Token expiration is required/
  );
  assert.throws(
    () => verifyToken(hs512Token, 'alg-secret', { now: 1000 }),
    /Invalid token algorithm/
  );
});

test('verifyToken rejects oversized token strings before JWT part decoding', () => {
  const oversizedToken = `${'a'.repeat(MAX_JWT_TOKEN_LENGTH + 1)}.e30.signature`;

  assert.throws(
    () => verifyToken(oversizedToken, 'oversized-token-secret', { now: 1000 }),
    { message: JWT_TOKEN_TOO_LONG_ERROR }
  );
});

test('verifyToken allows max-length token strings to reach signature validation', () => {
  const body = `${base64UrlJson({ alg: 'HS256', typ: 'JWT' })}.${base64UrlJson({
    userId: 101,
    iat: 1000,
    exp: 2000,
  })}`;
  const boundaryToken = `${body}.${'a'.repeat(MAX_JWT_TOKEN_LENGTH - body.length - 1)}`;

  assert.equal(boundaryToken.length, MAX_JWT_TOKEN_LENGTH);
  assert.throws(
    () => verifyToken(boundaryToken, 'boundary-token-secret', { now: 1000 }),
    /Invalid token signature/
  );
});

test('verifyToken rejects signed tokens without a usable userId claim', () => {
  const invalidPayloads = [
    { iat: 1000, exp: 2000 },
    { userId: null, iat: 1000, exp: 2000 },
    { userId: '', iat: 1000, exp: 2000 },
    { userId: '   ', iat: 1000, exp: 2000 },
    { userId: 'not-a-number', iat: 1000, exp: 2000 },
    { userId: '1.5', iat: 1000, exp: 2000 },
    { userId: '0', iat: 1000, exp: 2000 },
    { userId: 0, iat: 1000, exp: 2000 },
    { userId: -1, iat: 1000, exp: 2000 },
    { userId: 1.5, iat: 1000, exp: 2000 },
    { userId: String(Number.MAX_SAFE_INTEGER + 1), iat: 1000, exp: 2000 },
    { userId: Number.MAX_SAFE_INTEGER + 1, iat: 1000, exp: 2000 },
    { userId: [], iat: 1000, exp: 2000 },
    { userId: {}, iat: 1000, exp: 2000 },
  ];

  for (const payload of invalidPayloads) {
    const token = signRawJwt({ alg: 'HS256', typ: 'JWT' }, payload, 'user-claim-secret');

    assert.throws(
      () => verifyToken(token, 'user-claim-secret', { now: 1000 }),
      /Token userId is required/
    );
  }
});

test('extractBearerToken accepts only a single bearer credential', () => {
  assert.equal(extractBearerToken('Bearer token-123'), 'token-123');
  assert.equal(extractBearerToken('  bearer   token-123  '), 'token-123');
  assert.equal(extractBearerToken('BEARER abc.def.ghi'), 'abc.def.ghi');

  const malformedHeaders = [
    undefined,
    null,
    '',
    '   ',
    'token-123',
    'Basic token-123',
    'Bearer',
    'Bearer   ',
    'Bearer token-123 extra',
    ['Bearer token-123'],
    42,
  ];

  for (const header of malformedHeaders) {
    assert.equal(extractBearerToken(header), null);
  }
});

test('authenticateToken accepts tokens signed with configured and default secrets', () => {
  const passwordHasher = createPasswordHasher();
  const configured = createAuthHandlers(createDb([]), {
    jwtSecret: 'configured-secret',
    passwordHasher,
  });
  const configuredReq = {
    headers: { authorization: `Bearer ${signToken({ userId: 201 }, 'configured-secret')}` },
  };
  let configuredNextCalled = false;

  configured.authenticateToken(configuredReq, createRes(), () => {
    configuredNextCalled = true;
  });

  assert.equal(configuredNextCalled, true);
  assert.equal(configuredReq.user.userId, 201);

  const defaultSecret = createAuthHandlers(createDb([]), {
    env: { NODE_ENV: 'test' },
    passwordHasher,
  });
  const defaultReq = {
    headers: { authorization: `Bearer ${signToken({ userId: 202 }, DEFAULT_DEV_JWT_SECRET)}` },
  };
  let defaultNextCalled = false;

  defaultSecret.authenticateToken(defaultReq, createRes(), () => {
    defaultNextCalled = true;
  });

  assert.equal(defaultNextCalled, true);
  assert.equal(defaultReq.user.userId, 202);
});

test('authenticateToken normalizes numeric string userId claims to numbers', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'numeric-auth-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = {
    headers: { authorization: `Bearer ${signToken({ userId: '302' }, 'numeric-auth-secret')}` },
  };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 302);
  assert.equal(typeof req.user.userId, 'number');
});

test('authenticateToken rejects malformed authorization headers before token verification', () => {
  const signedToken = signToken({ userId: 301 }, 'auth-scheme-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'auth-scheme-secret',
    passwordHasher: createPasswordHasher(),
  });

  const malformedHeaders = [
    `Basic ${signedToken}`,
    signedToken,
    `Bearer ${signedToken} extra`,
    ['Bearer', signedToken],
  ];

  for (const authorization of malformedHeaders) {
    const req = { headers: { authorization } };
    const res = createRes();
    let nextCalled = false;

    authenticateToken(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
    assert.equal(req.user, undefined);
  }
});

test('authenticateToken returns 403 for signed tokens without a usable userId claim', () => {
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    { iat: 1000, exp: Math.floor(Date.now() / 1000) + 60 },
    'missing-user-secret'
  );
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'missing-user-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
  assert.equal(req.user, undefined);
});

test('resolveJwtSecret trims JWT_SECRET and returns the canonical secret', () => {
  assert.equal(resolveJwtSecret({ JWT_SECRET: '  from-env\n\t', NODE_ENV: 'test' }), 'from-env');
});

test('resolveJwtSecret rejects non-string injected JWT_SECRET values with a type error', () => {
  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: 12345, NODE_ENV: 'test' }),
    { name: 'TypeError', message: 'JWT_SECRET must be a string' }
  );
});

test('resolveJwtSecret rejects whitespace-only JWT_SECRET in every environment', () => {
  for (const NODE_ENV of ['test', 'development', 'production', undefined]) {
    assert.throws(
      () => resolveJwtSecret({ JWT_SECRET: ' \n\t ', NODE_ENV }),
      /JWT_SECRET must not be empty/,
      NODE_ENV || 'unset'
    );
  }

  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: '', NODE_ENV: 'test' }),
    /JWT_SECRET must not be empty/
  );
});

test('resolveJwtSecret requires JWT_SECRET in production', () => {
  assert.throws(
    () => resolveJwtSecret({ NODE_ENV: 'production' }),
    /JWT_SECRET must be set in production/
  );
});

test('resolveJwtSecret falls back to the deterministic dev secret outside production', () => {
  assert.equal(resolveJwtSecret({ NODE_ENV: 'test' }), DEFAULT_DEV_JWT_SECRET);
  assert.equal(resolveJwtSecret({ NODE_ENV: 'development' }), DEFAULT_DEV_JWT_SECRET);
  assert.equal(resolveJwtSecret({}), DEFAULT_DEV_JWT_SECRET);
});

test('resolveJwtExpiresInSeconds supports a configurable positive integer default', () => {
  assert.equal(resolveJwtExpiresInSeconds({ NODE_ENV: 'test' }), DEFAULT_JWT_EXPIRES_IN_SECONDS);
  assert.equal(resolveJwtExpiresInSeconds({ JWT_EXPIRES_IN_SECONDS: '120' }), 120);

  const invalidExpiresInValues = [
    '0',
    '-1',
    '1.5',
    String(Number.MAX_SAFE_INTEGER + 1),
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ];

  for (const value of invalidExpiresInValues) {
    assert.throws(
      () => resolveJwtExpiresInSeconds({ JWT_EXPIRES_IN_SECONDS: value }),
      /JWT_EXPIRES_IN_SECONDS must be a positive integer/,
      String(value)
    );
  }
});

test('authenticateToken preserves existing 401 and 403 responses for missing and invalid tokens', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'auth-failure-secret',
    passwordHasher: createPasswordHasher(),
  });
  const missingReq = { headers: {} };
  const missingRes = createRes();
  let missingNextCalled = false;

  authenticateToken(missingReq, missingRes, () => {
    missingNextCalled = true;
  });

  assert.equal(missingRes.statusCode, 401);
  assert.equal(missingNextCalled, false);

  const invalidReq = { headers: { authorization: 'Bearer not-a-valid-token' } };
  const invalidRes = createRes();
  let invalidNextCalled = false;

  authenticateToken(invalidReq, invalidRes, () => {
    invalidNextCalled = true;
  });

  assert.equal(invalidRes.statusCode, 403);
  assert.equal(invalidNextCalled, false);
});
