const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_DEV_JWT_SECRET,
  createAuthHandlers,
  resolveJwtExpiresInSeconds,
  resolveJwtSecret,
  signToken,
  verifyToken,
} = require('../auth');

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

test('login uses injected db for credential lookup', async () => {
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
  const req = { body: { email: 'grace@example.com', password: 's3cret' } };
  const res = createRes();

  await login(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /SELECT \* FROM users WHERE email = \$1/i);
  assert.deepEqual(db.calls[0].params, ['grace@example.com']);
  assert.deepEqual(passwordHasher.compareCalls, [
    { password: 's3cret', passwordHash: 'stored-hash' },
  ]);
  assert.equal(verifyToken(res.body.token, 'login-test-secret').userId, 77);
});

test('signToken adds exp and verifyToken rejects expired tokens', () => {
  const token = signToken({ userId: 'expiring-user' }, 'expiry-secret', {
    now: 1000,
    expiresInSeconds: 60,
  });

  assert.deepEqual(verifyToken(token, 'expiry-secret', { now: 1059 }), {
    userId: 'expiring-user',
    iat: 1000,
    exp: 1060,
  });
  assert.throws(() => verifyToken(token, 'expiry-secret', { now: 1060 }), /Token expired/);
});

test('authenticateToken returns 403 for expired tokens', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'expired-auth-secret',
    passwordHasher: createPasswordHasher(),
  });
  const token = signToken({ userId: 'expired-user' }, 'expired-auth-secret', {
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
    { userId: 'missing-exp', iat: 1000 },
    'alg-secret'
  );
  const hs512Token = signRawJwt(
    { alg: 'HS512', typ: 'JWT' },
    { userId: 'wrong-alg', iat: 1000, exp: 2000 },
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

test('authenticateToken accepts tokens signed with configured and default secrets', () => {
  const passwordHasher = createPasswordHasher();
  const configured = createAuthHandlers(createDb([]), {
    jwtSecret: 'configured-secret',
    passwordHasher,
  });
  const configuredReq = {
    headers: { authorization: `Bearer ${signToken({ userId: 'configured-user' }, 'configured-secret')}` },
  };
  let configuredNextCalled = false;

  configured.authenticateToken(configuredReq, createRes(), () => {
    configuredNextCalled = true;
  });

  assert.equal(configuredNextCalled, true);
  assert.equal(configuredReq.user.userId, 'configured-user');

  const defaultSecret = createAuthHandlers(createDb([]), {
    env: { NODE_ENV: 'test' },
    passwordHasher,
  });
  const defaultReq = {
    headers: { authorization: `Bearer ${signToken({ userId: 'default-user' }, DEFAULT_DEV_JWT_SECRET)}` },
  };
  let defaultNextCalled = false;

  defaultSecret.authenticateToken(defaultReq, createRes(), () => {
    defaultNextCalled = true;
  });

  assert.equal(defaultNextCalled, true);
  assert.equal(defaultReq.user.userId, 'default-user');
});

test('resolveJwtSecret prefers JWT_SECRET and keeps deterministic test default', () => {
  assert.equal(resolveJwtSecret({ JWT_SECRET: 'from-env', NODE_ENV: 'test' }), 'from-env');
  assert.equal(resolveJwtSecret({ NODE_ENV: 'test' }), DEFAULT_DEV_JWT_SECRET);
});

test('resolveJwtExpiresInSeconds supports a configurable positive integer default', () => {
  assert.equal(resolveJwtExpiresInSeconds({ NODE_ENV: 'test' }), DEFAULT_JWT_EXPIRES_IN_SECONDS);
  assert.equal(resolveJwtExpiresInSeconds({ JWT_EXPIRES_IN_SECONDS: '120' }), 120);
  assert.throws(
    () => resolveJwtExpiresInSeconds({ JWT_EXPIRES_IN_SECONDS: '0' }),
    /JWT_EXPIRES_IN_SECONDS must be a positive integer/
  );
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
