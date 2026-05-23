const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_HASH_MAX_LENGTH,
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_USERNAME_MAX_LENGTH,
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_DEV_JWT_SECRET,
  JWT_SECRET_MIN_PRODUCTION_BYTES,
  JWT_SECRET_MIN_PRODUCTION_BYTES_ERROR,
  JWT_TOKEN_TOO_LONG_ERROR,
  LOGIN_RATE_LIMIT_ERROR,
  MAX_JWT_TOKEN_LENGTH,
  MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
  PASSWORD_HASH_COST,
  REGISTRATION_RATE_LIMIT_ERROR,
  createAuthHandlers,
  extractBearerToken,
  resolveJwtExpiresInSeconds,
  resolveJwtSecret,
  signToken,
  verifyToken,
} = require('../auth');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');
const { getVarcharColumnLength } = require('./schemaHelpers');

const USERNAME_UNSAFE_CHARACTER_ERROR =
  'Username cannot contain line breaks, control characters, or invisible formatting characters';

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

function createQueryResultWithInheritedShape(rowCount, rows) {
  return Object.create({ rowCount, rows });
}

function createQueryResultWithAccessorShape(rowCount, rows) {
  const result = {};
  Object.defineProperties(result, {
    rowCount: {
      enumerable: true,
      get: () => rowCount,
    },
    rows: {
      enumerable: true,
      get: () => rows,
    },
  });
  return result;
}

function createQueryResultWithSetterOnlyAccessorField(fieldName, rowCount, rows) {
  const result = { rowCount, rows };
  Object.defineProperty(result, fieldName, {
    enumerable: true,
    set: () => {},
  });
  return result;
}

function createQueryResultSetterOnlyAccessorCases(rowCount, rows) {
  return [
    {
      name: 'setter-only accessor rowCount',
      result: createQueryResultWithSetterOnlyAccessorField('rowCount', rowCount, rows),
    },
    {
      name: 'setter-only accessor rows',
      result: createQueryResultWithSetterOnlyAccessorField('rows', rowCount, rows),
    },
  ];
}

function createArrayShapedQueryResult(rowCount, rows) {
  return Object.assign([], { rowCount, rows });
}

function createRowWithAccessorField(row, fieldName) {
  const accessorRow = { ...row };
  const value = accessorRow[fieldName];
  Object.defineProperty(accessorRow, fieldName, {
    enumerable: true,
    get: () => value,
  });
  return accessorRow;
}

function createRowWithSetterOnlyAccessorField(row, fieldName) {
  const accessorRow = { ...row };
  Object.defineProperty(accessorRow, fieldName, {
    enumerable: true,
    set: () => {},
  });
  return accessorRow;
}

function createBodyWithInheritedFields(inheritedFields, ownFields = {}) {
  return Object.assign(Object.create(inheritedFields), ownFields);
}

function createRequestWithInheritedFields(inheritedFields, ownFields = {}) {
  return Object.assign(Object.create(inheritedFields), ownFields);
}

function createObjectWithAccessorFields(accessorFields, ownFields = {}) {
  const object = { ...ownFields };
  const accessCounts = {};

  for (const [fieldName, value] of Object.entries(accessorFields)) {
    accessCounts[fieldName] = 0;
    Object.defineProperty(object, fieldName, {
      enumerable: true,
      get() {
        accessCounts[fieldName] += 1;
        return value;
      },
    });
  }

  return { object, accessCounts };
}

function createRegistrationRow(id, email = 'ada@example.com') {
  return { id, email };
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

function createSequencePasswordHasher(compareResults) {
  const passwordHasher = createPasswordHasher();
  const results = [...compareResults];

  passwordHasher.compare = async function compare(password, passwordHash) {
    this.compareCalls.push({ password, passwordHash });
    return results.length > 0 ? results.shift() : false;
  };

  return passwordHasher;
}

async function loginMissingAccount(login, req, email, password = 'candidate-password') {
  const res = createRes();
  Object.assign(req, { body: { email, password } });

  await login(req, res);

  return res;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signRawJwt(header, payload, secret) {
  return signRawJwtSegments(base64UrlJson(header), base64UrlJson(payload), secret);
}

function signRawJwtSegments(encodedHeader, encodedPayload, secret) {
  const body = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodeJwtPayload(token) {
  const [, encodedPayload] = token.split('.');
  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
}

function withObjectPrototypeProperties(properties, callback) {
  const previousDescriptors = new Map();
  const modifiedKeys = [];

  // Synchronous-only: cleanup runs as soon as the callback returns.
  try {
    for (const [key, value] of Object.entries(properties)) {
      previousDescriptors.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
      modifiedKeys.push(key);
    }

    const result = callback();
    if (
      result !== null
      && (typeof result === 'object' || typeof result === 'function')
      && typeof result.then === 'function'
    ) {
      throw new TypeError('withObjectPrototypeProperties callback must be synchronous');
    }

    return result;
  } finally {
    for (const key of modifiedKeys.reverse()) {
      const descriptor = previousDescriptors.get(key);
      if (descriptor === undefined) {
        delete Object.prototype[key];
      } else {
        Object.defineProperty(Object.prototype, key, descriptor);
      }
    }
  }
}

test('register uses injected db and returns a signed token with inserted user id', async () => {
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow(42)] }]);
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
    { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
  ]);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /INSERT INTO users/i);
  assert.match(db.calls[0].sql, /RETURNING\s+id\s*,\s*email/i);
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

test('register does not mint a token when the inserted user id is invalid', async () => {
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow('not-a-number')] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'invalid-register-user-secret',
    passwordHasher,
  });
  const res = createRes();

  await register({
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password: 'correct horse battery staple',
    },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error registering user' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.hashCalls, [
    { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
  ]);
  assert.equal(db.calls.length, 1);
});

test('register does not mint a token when the inserted row email mismatches the request', async (t) => {
  const cases = [
    { name: 'missing returned email', row: { id: 42 } },
    { name: 'wrong returned email', row: createRegistrationRow(42, 'other@example.com') },
  ];

  for (const { name, row } of cases) {
    await t.test(name, async () => {
      const db = createDb([{ rowCount: 1, rows: [row] }]);
      const passwordHasher = createPasswordHasher();
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'mismatched-register-email-secret',
        passwordHasher,
      });
      const res = createRes();

      await register({
        body: {
          username: 'ada',
          email: ' ADA@Example.COM ',
          password: 'correct horse battery staple',
        },
      }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error registering user' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.hashCalls, [
        { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
      ]);
      assert.equal(db.calls.length, 1);
      assert.deepEqual(db.calls[0].params, [
        'ada',
        'ada@example.com',
        'hashed:correct horse battery staple',
      ]);
    });
  }
});

test('register does not mint a token when the inserted row is not an object record', async (t) => {
  const cases = [
    { name: 'null returned row', row: null },
    { name: 'string returned row', row: '42' },
    { name: 'number returned row', row: 42 },
    { name: 'array returned row', row: Object.assign([], createRegistrationRow(42)) },
  ];

  for (const { name, row } of cases) {
    await t.test(name, async () => {
      const db = createDb([{ rowCount: 1, rows: [row] }]);
      const passwordHasher = createPasswordHasher();
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'malformed-register-row-secret',
        passwordHasher,
      });
      const res = createRes();

      await register({
        body: {
          username: 'ada',
          email: ' ADA@Example.COM ',
          password: 'correct horse battery staple',
        },
      }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error registering user' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.hashCalls, [
        { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
      ]);
      assert.equal(db.calls.length, 1);
      assert.deepEqual(db.calls[0].params, [
        'ada',
        'ada@example.com',
        'hashed:correct horse battery staple',
      ]);
    });
  }
});

test('register fails closed when the insert result cardinality is malformed', async (t) => {
  const malformedResults = [
    {
      name: 'rowCount zero with returned id',
      result: { rowCount: 0, rows: [createRegistrationRow(42)] },
    },
    { name: 'rowCount one with no rows', result: { rowCount: 1, rows: [] } },
    {
      name: 'string rowCount with one returned id',
      result: { rowCount: '1', rows: [createRegistrationRow(42)] },
    },
    {
      name: 'inherited rows and rowCount',
      result: createQueryResultWithInheritedShape(1, [createRegistrationRow(42)]),
    },
    {
      name: 'accessor rows and rowCount',
      result: createQueryResultWithAccessorShape(1, [createRegistrationRow(42)]),
    },
    ...createQueryResultSetterOnlyAccessorCases(1, [createRegistrationRow(42)]),
    {
      name: 'array-shaped result with returned id',
      result: createArrayShapedQueryResult(1, [createRegistrationRow(42)]),
    },
    {
      name: 'multiple returned rows',
      result: {
        rowCount: 2,
        rows: [createRegistrationRow(42), createRegistrationRow(43)],
      },
    },
    { name: 'missing rows array', result: { rowCount: 1 } },
  ];

  for (const { name, result } of malformedResults) {
    await t.test(name, async () => {
      const db = createDb([result]);
      const passwordHasher = createPasswordHasher();
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'malformed-register-result-secret',
        passwordHasher,
      });
      const res = createRes();

      await register({
        body: {
          username: 'ada',
          email: 'ada@example.com',
          password: 'correct horse battery staple',
        },
      }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error registering user' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.hashCalls, [
        { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
      ]);
      assert.equal(db.calls.length, 1);
    });
  }
});

test('register does not mint a token when returned identity fields are accessors', async (t) => {
  const returnedRow = createRegistrationRow(42);
  const cases = [
    { name: 'accessor returned id', row: createRowWithAccessorField(returnedRow, 'id') },
    { name: 'accessor returned email', row: createRowWithAccessorField(returnedRow, 'email') },
    {
      name: 'setter-only accessor returned id',
      row: createRowWithSetterOnlyAccessorField(returnedRow, 'id'),
    },
  ];

  for (const { name, row } of cases) {
    await t.test(name, async () => {
      const db = createDb([{ rowCount: 1, rows: [row] }]);
      const passwordHasher = createPasswordHasher();
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'accessor-register-row-secret',
        passwordHasher,
      });
      const res = createRes();

      await register({
        body: {
          username: 'ada',
          email: 'ada@example.com',
          password: 'correct horse battery staple',
        },
      }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error registering user' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.hashCalls, [
        { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
      ]);
      assert.equal(db.calls.length, 1);
    });
  }
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
      name: 'username with embedded line break',
      body: { username: 'Ada\nLovelace', email: 'ada@example.com', password: 'valid-pass' },
      error: USERNAME_UNSAFE_CHARACTER_ERROR,
    },
    {
      name: 'username with invisible formatting mark',
      body: { username: 'Ada\u202eLovelace', email: 'ada@example.com', password: 'valid-pass' },
      error: USERNAME_UNSAFE_CHARACTER_ERROR,
    },
    {
      name: 'username with C1 control character',
      body: { username: 'Ada\u0085Lovelace', email: 'ada@example.com', password: 'valid-pass' },
      error: USERNAME_UNSAFE_CHARACTER_ERROR,
    },
    {
      name: 'username with zero width space',
      body: { username: 'Ada\u200bLovelace', email: 'ada@example.com', password: 'valid-pass' },
      error: USERNAME_UNSAFE_CHARACTER_ERROR,
    },
    {
      name: 'invalid email',
      body: { username: 'ada', email: 'ada@@example.com', password: 'valid-pass' },
      error: 'Valid email is required',
    },
    {
      name: 'email with embedded whitespace',
      body: { username: 'ada', email: 'ada \n@example.com', password: 'valid-pass' },
      error: 'Valid email is required',
    },
    {
      name: 'email with control character',
      body: { username: 'ada', email: 'ada\u0000@example.com', password: 'valid-pass' },
      error: 'Valid email is required',
    },
    {
      name: 'email with C1 control character',
      body: { username: 'ada', email: 'ada\u0085@example.com', password: 'valid-pass' },
      error: 'Valid email is required',
    },
    {
      name: 'email with invisible formatting mark',
      body: { username: 'ada', email: 'ada\u200e@example.com', password: 'valid-pass' },
      error: 'Valid email is required',
    },
    {
      name: 'email with zero width space',
      body: { username: 'ada', email: 'ada\u200b@example.com', password: 'valid-pass' },
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

test('register ignores inherited body fields before hashing or querying', async () => {
  const db = createDb([]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'inherited-register-secret',
    passwordHasher,
  });
  const res = createRes();

  await register({
    body: createBodyWithInheritedFields({
      username: 'ada',
      email: 'ada@example.com',
      password: 'valid-pass',
    }),
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Username is required' });
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(db.calls, []);
});

test('register ignores accessor body fields before hashing or querying', async () => {
  const db = createDb([]);
  const passwordHasher = createPasswordHasher();
  const { object: body, accessCounts } = createObjectWithAccessorFields({
    username: 'ada',
    email: 'ada@example.com',
    password: 'valid-pass',
  });
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'accessor-register-secret',
    passwordHasher,
  });
  const res = createRes();

  await register({ body }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Username is required' });
  assert.deepEqual(accessCounts, {
    username: 0,
    email: 0,
    password: 0,
  });
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(db.calls, []);
});

test('register ignores inherited request body container before hashing, querying, or rate tracking', async () => {
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow(45)] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'inherited-register-container-secret',
    passwordHasher,
    registrationRateLimit: { maxAttempts: 1, windowMs: 60000 },
  });
  const inheritedReq = createRequestWithInheritedFields({
    body: {
      username: 'polluted',
      email: 'polluted@example.com',
      password: 'valid-pass',
    },
  });
  const inheritedRes = createRes();

  await register(inheritedReq, inheritedRes);

  assert.equal(inheritedRes.statusCode, 400);
  assert.deepEqual(inheritedRes.body, { error: 'Username is required' });
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(db.calls, []);

  const validRes = createRes();
  await register({
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password: 'valid-pass',
    },
  }, validRes);

  assert.equal(validRes.statusCode, 201);
  assert.equal(typeof validRes.body.token, 'string');
  assert.deepEqual(passwordHasher.hashCalls, [
    { password: 'valid-pass', rounds: PASSWORD_HASH_COST },
  ]);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['ada', 'ada@example.com', 'hashed:valid-pass']);
});

test('register ignores accessor request body container before hashing, querying, or rate tracking', async () => {
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow(45)] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'accessor-register-container-secret',
    passwordHasher,
    registrationRateLimit: { maxAttempts: 1, windowMs: 60000 },
  });
  const accessorReq = {};
  let bodyAccessCount = 0;
  Object.defineProperty(accessorReq, 'body', {
    enumerable: true,
    get() {
      bodyAccessCount += 1;
      return {
        username: 'polluted',
        email: 'polluted@example.com',
        password: 'valid-pass',
      };
    },
  });
  const accessorRes = createRes();

  await register(accessorReq, accessorRes);

  assert.equal(accessorRes.statusCode, 400);
  assert.deepEqual(accessorRes.body, { error: 'Username is required' });
  assert.equal(bodyAccessCount, 0);
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(db.calls, []);

  const validRes = createRes();
  await register({
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password: 'valid-pass',
    },
  }, validRes);

  assert.equal(validRes.statusCode, 201);
  assert.equal(typeof validRes.body.token, 'string');
  assert.deepEqual(passwordHasher.hashCalls, [
    { password: 'valid-pass', rounds: PASSWORD_HASH_COST },
  ]);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['ada', 'ada@example.com', 'hashed:valid-pass']);
});

test('register accepts a password exactly at the bcrypt byte limit', async () => {
  const password = 'a'.repeat(AUTH_PASSWORD_MAX_BYTES);
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow(44)] }]);
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
  assert.deepEqual(passwordHasher.hashCalls, [{ password, rounds: PASSWORD_HASH_COST }]);
  assert.equal(db.calls.length, 1);
});

test('register trims username and surrounding email whitespace before storing', async () => {
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow(43)] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'normal-register-secret',
    passwordHasher,
  });
  const req = {
    body: {
      username: '  Ada Lovelace  ',
      email: '\n\t ADA@Example.COM \r\n',
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

test('register rejects invalid password hasher output before inserting a user', async (t) => {
  const cases = [
    { name: 'undefined hash', hash: undefined },
    { name: 'non-string hash', hash: null },
    { name: 'empty hash', hash: '' },
    { name: 'whitespace-only hash', hash: '   ' },
    { name: 'hash with line break', hash: 'stored\nhash' },
    { name: 'hash with mid-string NBSP', hash: 'stored\u00A0hash' },
    { name: 'hash with mid-string ideographic space', hash: 'stored\u3000hash' },
    { name: 'hash with invisible formatting mark', hash: 'stored\u202ehash' },
    { name: 'over-length hash', hash: 'x'.repeat(AUTH_PASSWORD_HASH_MAX_LENGTH + 1) },
  ];

  for (const { name, hash } of cases) {
    await t.test(name, async () => {
      const db = createDb([]);
      const passwordHasher = createPasswordHasher();
      passwordHasher.hash = async function hashPassword(password, rounds) {
        this.hashCalls.push({ password, rounds });
        return hash;
      };
      const { register } = createAuthHandlers(db, {
        jwtSecret: 'invalid-hash-register-secret',
        passwordHasher,
      });
      const res = createRes();

      await register({
        body: {
          username: 'ada',
          email: 'ada@example.com',
          password: 'correct horse battery staple',
        },
      }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error registering user' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.hashCalls, [
        { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
      ]);
      assert.equal(db.calls.length, 0);
    });
  }
});

test('password hash runtime cap matches the users.password_hash column length', () => {
  assert.equal(
    AUTH_PASSWORD_HASH_MAX_LENGTH,
    getVarcharColumnLength('users', 'password_hash'),
  );
});

test('register returns 409 for duplicate username or email unique violations without minting a token', async (t) => {
  const cases = [
    { name: 'duplicate username', constraint: 'users_username_key' },
    { name: 'duplicate email', constraint: 'users_email_key' },
    { name: 'duplicate normalized email', constraint: 'users_normalized_email_unique_idx' },
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
        { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
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
    { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
  ]);
  assert.equal(db.calls.length, 1);
  assert.doesNotMatch(db.calls[0].sql, /ON\s+CONFLICT/i);
});

test('register throttles repeated source attempts before hashing or inserting users', async () => {
  const db = createDb([
    { rowCount: 1, rows: [createRegistrationRow(51, 'ada-0@example.com')] },
    { rowCount: 1, rows: [createRegistrationRow(52, 'ada-1@example.com')] },
  ]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'register-rate-limit-secret',
    passwordHasher,
    registrationRateLimit: {
      maxAttempts: 2,
      windowMs: 60000,
      now: () => 2100,
    },
  });
  const sourceIp = '203.0.113.50';
  const password = 'correct horse battery staple';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = createRes();

    await register({
      ip: sourceIp,
      body: {
        username: `ada-${attempt}`,
        email: `ada-${attempt}@example.com`,
        password,
      },
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(typeof res.body.token, 'string');
  }

  const blockedRes = createRes();
  await register({
    ip: sourceIp,
    body: {
      username: 'blocked-user',
      email: 'blocked@example.com',
      password,
    },
  }, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: REGISTRATION_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['ada-0', 'ada-0@example.com', `hashed:${password}`],
    ['ada-1', 'ada-1@example.com', `hashed:${password}`],
  ]);
  assert.deepEqual(passwordHasher.hashCalls, [
    { password, rounds: PASSWORD_HASH_COST },
    { password, rounds: PASSWORD_HASH_COST },
  ]);
});

test('register invalid input does not consume registration throttle attempts', async () => {
  const db = createDb([{ rowCount: 1, rows: [createRegistrationRow(53)] }]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'invalid-register-rate-limit-secret',
    passwordHasher,
    registrationRateLimit: {
      maxAttempts: 1,
      windowMs: 60000,
      now: () => 2200,
    },
  });
  const sourceIp = '203.0.113.51';

  const invalidRes = createRes();
  await register({
    ip: sourceIp,
    body: {
      username: 'ada',
      email: 'not-an-email',
      password: 'correct horse battery staple',
    },
  }, invalidRes);

  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, { error: 'Valid email is required' });
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(db.calls, []);

  const validRes = createRes();
  await register({
    ip: sourceIp,
    body: {
      username: 'ada',
      email: 'ada@example.com',
      password: 'correct horse battery staple',
    },
  }, validRes);

  assert.equal(validRes.statusCode, 201);
  assert.equal(typeof validRes.body.token, 'string');
  assert.deepEqual(passwordHasher.hashCalls, [
    { password: 'correct horse battery staple', rounds: PASSWORD_HASH_COST },
  ]);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [
    'ada',
    'ada@example.com',
    'hashed:correct horse battery staple',
  ]);
});

test('register allows valid attempts after the throttle window expires', async () => {
  let now = 2300;
  const db = createDb([
    { rowCount: 1, rows: [createRegistrationRow(54, 'ada-first@example.com')] },
    { rowCount: 1, rows: [createRegistrationRow(55, 'ada-retried@example.com')] },
  ]);
  const passwordHasher = createPasswordHasher();
  const { register } = createAuthHandlers(db, {
    jwtSecret: 'register-rate-limit-window-secret',
    passwordHasher,
    registrationRateLimit: {
      maxAttempts: 1,
      windowMs: 60000,
      now: () => now,
    },
  });
  const sourceIp = '203.0.113.52';
  const password = 'correct horse battery staple';

  const firstRes = createRes();
  await register({
    ip: sourceIp,
    body: {
      username: 'ada-first',
      email: 'ada-first@example.com',
      password,
    },
  }, firstRes);
  assert.equal(firstRes.statusCode, 201);

  const blockedRes = createRes();
  await register({
    ip: sourceIp,
    body: {
      username: 'ada-blocked',
      email: 'ada-blocked@example.com',
      password,
    },
  }, blockedRes);
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: REGISTRATION_RATE_LIMIT_ERROR });

  now += 60000;
  const retriedRes = createRes();
  await register({
    ip: sourceIp,
    body: {
      username: 'ada-retried',
      email: 'ada-retried@example.com',
      password,
    },
  }, retriedRes);

  assert.equal(retriedRes.statusCode, 201);
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['ada-first', 'ada-first@example.com', `hashed:${password}`],
    ['ada-retried', 'ada-retried@example.com', `hashed:${password}`],
  ]);
  assert.deepEqual(passwordHasher.hashCalls, [
    { password, rounds: PASSWORD_HASH_COST },
    { password, rounds: PASSWORD_HASH_COST },
  ]);
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
  assert.equal(db.calls[0].sql, 'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 2');
  assert.doesNotMatch(db.calls[0].sql, /SELECT\s+\*/i);
  assert.deepEqual(db.calls[0].params, ['grace@example.com']);
  assert.deepEqual(passwordHasher.compareCalls, [
    { password, passwordHash: 'stored-hash' },
  ]);
  assert.equal(verifyToken(res.body.token, 'login-test-secret').userId, 77);
});

test('login compares against the fixed dummy hash for a missing user before returning 401', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'missing-login-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: 'missing@example.com', password: 'correct-password' } }, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Invalid credentials' });
  assert.equal(res.body.token, undefined);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['missing@example.com']);
  assert.deepEqual(passwordHasher.compareCalls, [
    {
      password: 'correct-password',
      passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
    },
  ]);
});

test('missing-account dummy hash cost matches registration hash cost', () => {
  const [, , dummyHashCost] = MISSING_ACCOUNT_DUMMY_PASSWORD_HASH.split('$');

  assert.equal(Number(dummyHashCost), PASSWORD_HASH_COST);
});

test('login compares an existing user password only against the stored hash', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'existing-login-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.deepEqual(passwordHasher.compareCalls, [
    { password: 'stored-password', passwordHash: 'stored-user-hash' },
  ]);
  assert.notEqual(passwordHasher.compareCalls[0].passwordHash, MISSING_ACCOUNT_DUMMY_PASSWORD_HASH);
  assert.equal(verifyToken(res.body.token, 'existing-login-secret').userId, 79);
});

test('login requires an exact boolean true password comparison before issuing a token', async (t) => {
  const truthyNonBooleanResults = [
    { name: 'string true', compareResult: 'true' },
    { name: 'numeric one', compareResult: 1 },
    { name: 'object result', compareResult: { match: true } },
  ];

  for (const { name, compareResult } of truthyNonBooleanResults) {
    await t.test(name, async () => {
      const db = createDb([
        {
          rowCount: 1,
          rows: [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }],
        },
      ]);
      const passwordHasher = createPasswordHasher({ compareResult });
      const { login } = createAuthHandlers(db, {
        jwtSecret: 'strict-compare-login-secret',
        passwordHasher,
        loginRateLimit: {
          maxFailures: 1,
          windowMs: 60000,
          now: () => 1300,
        },
      });
      const req = {
        ip: '203.0.113.43',
        body: { email: 'ada@example.com', password: 'stored-password' },
      };
      const res = createRes();

      await login(req, res);

      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Invalid credentials' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.compareCalls, [
        { password: 'stored-password', passwordHash: 'stored-user-hash' },
      ]);

      const blockedRes = createRes();
      await login(req, blockedRes);

      assert.equal(blockedRes.statusCode, 429);
      assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
      assert.equal(db.calls.length, 1);
    });
  }
});

test('login fails closed when the normalized email lookup returns multiple rows', async () => {
  const db = createDb([
    {
      rowCount: 2,
      rows: [
        { id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' },
        { id: 80, email: 'ada@example.com', password_hash: 'other-user-hash' },
      ],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'duplicate-login-user-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error logging in' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.compareCalls, []);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].sql, 'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 2');
  assert.deepEqual(db.calls[0].params, ['ada@example.com']);
});

test('login fails closed when the lookup result cardinality is malformed', async (t) => {
  const malformedResults = [
    {
      name: 'rowCount zero with returned user',
      result: {
        rowCount: 0,
        rows: [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }],
      },
    },
    { name: 'rowCount one with no rows', result: { rowCount: 1, rows: [] } },
    {
      name: 'fractional rowCount with returned user',
      result: {
        rowCount: 1.5,
        rows: [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }],
      },
    },
    {
      name: 'inherited rows and rowCount',
      result: createQueryResultWithInheritedShape(
        1,
        [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }]
      ),
    },
    {
      name: 'accessor rows and rowCount',
      result: createQueryResultWithAccessorShape(
        1,
        [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }]
      ),
    },
    ...createQueryResultSetterOnlyAccessorCases(
      1,
      [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }]
    ),
    {
      name: 'array-shaped result with returned user',
      result: createArrayShapedQueryResult(
        1,
        [{ id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' }]
      ),
    },
  ];

  for (const { name, result } of malformedResults) {
    await t.test(name, async () => {
      const db = createDb([result]);
      const passwordHasher = createPasswordHasher({ compareResult: true });
      const { login } = createAuthHandlers(db, {
        jwtSecret: 'malformed-login-result-secret',
        passwordHasher,
      });
      const res = createRes();

      await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error logging in' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.compareCalls, []);
      assert.equal(db.calls.length, 1);
      assert.equal(db.calls[0].sql, 'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 2');
      assert.deepEqual(db.calls[0].params, ['ada@example.com']);
    });
  }
});

test('login fails closed when the lookup row email does not match the normalized email', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 79, email: 'Ada@example.com', password_hash: 'stored-user-hash' }],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'mismatched-login-user-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: ' ADA@Example.COM ', password: 'stored-password' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error logging in' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.compareCalls, []);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].sql, 'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 2');
  assert.deepEqual(db.calls[0].params, ['ada@example.com']);
});

test('login fails closed when lookup row identity fields are inherited', async () => {
  const inheritedRowFields = {
    id: 79,
    email: 'ada@example.com',
    password_hash: 'stored-user-hash',
  };
  const db = createDb([
    {
      rowCount: 1,
      rows: [Object.create(inheritedRowFields)],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'inherited-login-row-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error logging in' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.compareCalls, []);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['ada@example.com']);
});

test('login fails closed when lookup row identity fields are accessors', async (t) => {
  const userRow = { id: 79, email: 'ada@example.com', password_hash: 'stored-user-hash' };
  const cases = [
    { name: 'accessor user id', row: createRowWithAccessorField(userRow, 'id') },
    { name: 'accessor email', row: createRowWithAccessorField(userRow, 'email') },
  ];

  for (const { name, row } of cases) {
    await t.test(name, async () => {
      const db = createDb([
        {
          rowCount: 1,
          rows: [row],
        },
      ]);
      const passwordHasher = createPasswordHasher({ compareResult: true });
      const { login } = createAuthHandlers(db, {
        jwtSecret: 'accessor-login-row-secret',
        passwordHasher,
      });
      const res = createRes();

      await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error logging in' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.compareCalls, []);
      assert.equal(db.calls.length, 1);
      assert.deepEqual(db.calls[0].params, ['ada@example.com']);
    });
  }
});

test('login fails closed when the lookup result rows shape is invalid', async (t) => {
  const invalidResults = [
    { name: 'missing rows', result: { rowCount: 1 } },
    { name: 'non-array rows', result: { rowCount: 1, rows: { id: 79 } } },
  ];

  for (const { name, result } of invalidResults) {
    await t.test(name, async () => {
      const db = createDb([result]);
      const passwordHasher = createPasswordHasher({ compareResult: true });
      const { login } = createAuthHandlers(db, {
        jwtSecret: 'invalid-login-rows-secret',
        passwordHasher,
      });
      const res = createRes();

      await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error logging in' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.compareCalls, []);
      assert.equal(db.calls.length, 1);
      assert.equal(
        db.calls[0].sql,
        'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 2'
      );
      assert.deepEqual(db.calls[0].params, ['ada@example.com']);
    });
  }
});

test('login does not compare or mint a token when the stored user id is invalid', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 'not-a-number', email: 'ada@example.com', password_hash: 'stored-user-hash' }],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'invalid-login-user-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: 'ada@example.com', password: 'stored-password' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error logging in' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.compareCalls, []);
  assert.equal(db.calls.length, 1);
});

test('login treats invalid stored password hashes as credential failures with rate limiting', async (t) => {
  const invalidHashes = [
    { name: 'missing hash', passwordHash: undefined },
    { name: 'null hash', passwordHash: null },
    { name: 'numeric hash', passwordHash: 12345 },
    { name: 'empty hash', passwordHash: '' },
    { name: 'whitespace-only hash', passwordHash: '   ' },
    { name: 'hash with line break', passwordHash: 'stored\nhash' },
    { name: 'hash with mid-string NBSP', passwordHash: 'stored\u00A0hash' },
    { name: 'hash with mid-string ideographic space', passwordHash: 'stored\u3000hash' },
    { name: 'hash with invisible formatting mark', passwordHash: 'stored\u202ehash' },
    {
      name: 'over-length hash',
      passwordHash: 'x'.repeat(AUTH_PASSWORD_HASH_MAX_LENGTH + 1),
    },
  ];

  for (const { name, passwordHash } of invalidHashes) {
    await t.test(name, async () => {
      const db = createDb([
        {
          rowCount: 1,
          rows: [{ id: 80, email: 'ada@example.com', password_hash: passwordHash }],
        },
      ]);
      const passwordHasher = createPasswordHasher({ compareResult: true });
      const { login } = createAuthHandlers(db, {
        jwtSecret: 'invalid-stored-hash-secret',
        passwordHasher,
        loginRateLimit: {
          maxFailures: 1,
          windowMs: 60000,
          now: () => 1250,
        },
      });
      const req = {
        ip: '203.0.113.40',
        body: { email: 'ada@example.com', password: 'candidate-password' },
      };
      const res = createRes();

      await login(req, res);

      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Invalid credentials' });
      assert.equal(res.body.token, undefined);
      assert.deepEqual(passwordHasher.compareCalls, [
        {
          password: 'candidate-password',
          passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
        },
      ]);

      const blockedRes = createRes();
      await login(req, blockedRes);

      assert.equal(blockedRes.statusCode, 429);
      assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
      assert.equal(db.calls.length, 1);
      assert.deepEqual(db.calls[0].params, ['ada@example.com']);
      assert.equal(passwordHasher.compareCalls.length, 1);
    });
  }
});

test('login throttles repeated credential failures before additional database work', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 80, email: 'ada@example.com', password_hash: 'stored-user-hash' }],
    },
    {
      rowCount: 1,
      rows: [{ id: 80, email: 'ada@example.com', password_hash: 'stored-user-hash' }],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: false });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'rate-limit-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1000,
    },
  });
  const req = {
    ip: '203.0.113.10',
    body: { email: ' ADA@Example.COM ', password: 'wrong-password' },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = createRes();

    await login(req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
  }

  const blockedRes = createRes();
  await login(req, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.equal(passwordHasher.compareCalls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['ada@example.com'],
    ['ada@example.com'],
  ]);
});

test('login throttles repeated missing-account failures before extra dummy work', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'missing-rate-limit-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1500,
    },
  });
  const req = {
    ip: '203.0.113.11',
    body: { email: ' MISSING@Example.COM ', password: 'candidate-password' },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = createRes();

    await login(req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
  }

  const blockedRes = createRes();
  await login(req, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.equal(passwordHasher.compareCalls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['missing@example.com'],
    ['missing@example.com'],
  ]);
  assert.deepEqual(passwordHasher.compareCalls, [
    {
      password: 'candidate-password',
      passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
    },
    {
      password: 'candidate-password',
      passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
    },
  ]);
});

test('login keeps source IP spray threshold independent from credential threshold', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const now = () => 1750;
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'source-rate-limit-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 1,
      windowMs: 60000,
      now,
    },
    loginSourceRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now,
    },
  });
  const sourceIp = '203.0.113.12';
  const password = 'candidate-password';

  for (const email of ['first@example.com', 'second@example.com']) {
    const res = createRes();

    await login({ ip: sourceIp, body: { email, password } }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
  }

  const blockedRes = createRes();
  await login({ ip: sourceIp, body: { email: 'third@example.com', password } }, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.equal(passwordHasher.compareCalls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['first@example.com'],
    ['second@example.com'],
  ]);
  assert.deepEqual(passwordHasher.compareCalls, [
    { password, passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH },
    { password, passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH },
  ]);
});

test('login throttles unknown source password spraying before extra work', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'unknown-source-rate-limit-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1800,
    },
  });
  const password = 'candidate-password';

  for (const email of ['first@example.com', 'second@example.com']) {
    const res = createRes();

    await login({ body: { email, password } }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
  }

  const blockedRes = createRes();
  await login({ body: { email: 'third@example.com', password } }, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.equal(passwordHasher.compareCalls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['first@example.com'],
    ['second@example.com'],
  ]);
  assert.deepEqual(passwordHasher.compareCalls, [
    { password, passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH },
    { password, passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH },
  ]);
});

test('login ignores inherited request ip so missing sources share the unknown throttle key', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'inherited-request-ip-rate-limit-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1810,
    },
  });

  const firstRes = await loginMissingAccount(
    login,
    createRequestWithInheritedFields({ ip: '198.51.100.10' }),
    'first@example.com'
  );
  const secondRes = await loginMissingAccount(
    login,
    createRequestWithInheritedFields({ ip: '198.51.100.11' }),
    'second@example.com'
  );
  const blockedRes = await loginMissingAccount(
    login,
    createRequestWithInheritedFields({ ip: '198.51.100.12' }),
    'third@example.com'
  );

  assert.equal(firstRes.statusCode, 401);
  assert.equal(secondRes.statusCode, 401);
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['first@example.com'],
    ['second@example.com'],
  ]);
  assert.equal(passwordHasher.compareCalls.length, 2);
});

test('login uses own request ip ahead of inherited forged ip values', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'own-request-ip-rate-limit-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 1,
      windowMs: 60000,
      now: () => 1820,
    },
  });
  const sourceIp = '203.0.113.60';

  const firstRes = await loginMissingAccount(
    login,
    createRequestWithInheritedFields(
      { ip: '198.51.100.20' },
      {
        ip: sourceIp,
        socket: { remoteAddress: '198.51.100.22' },
        connection: { remoteAddress: '198.51.100.23' },
      }
    ),
    'first@example.com'
  );
  const unknownRes = await loginMissingAccount(login, {}, 'unknown@example.com');
  const blockedRes = await loginMissingAccount(
    login,
    createRequestWithInheritedFields(
      { ip: '198.51.100.21' },
      {
        ip: sourceIp,
        socket: { remoteAddress: '198.51.100.24' },
        connection: { remoteAddress: '198.51.100.25' },
      }
    ),
    'second@example.com'
  );

  assert.equal(firstRes.statusCode, 401);
  assert.equal(unknownRes.statusCode, 401);
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['first@example.com'],
    ['unknown@example.com'],
  ]);
  assert.equal(passwordHasher.compareCalls.length, 2);
});

test('login ignores inherited socket and connection remote addresses for source throttling', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'inherited-socket-rate-limit-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1830,
    },
  });
  const requestWithInheritedContainers = createRequestWithInheritedFields({
    socket: { remoteAddress: '198.51.100.30' },
    connection: { remoteAddress: '198.51.100.31' },
  });
  const requestWithInheritedRemoteAddresses = {
    socket: Object.create({ remoteAddress: '198.51.100.32' }),
    connection: Object.create({ remoteAddress: '198.51.100.33' }),
  };

  const firstRes = await loginMissingAccount(
    login,
    requestWithInheritedContainers,
    'first@example.com'
  );
  const secondRes = await loginMissingAccount(
    login,
    requestWithInheritedRemoteAddresses,
    'second@example.com'
  );
  const blockedRes = await loginMissingAccount(login, {}, 'third@example.com');

  assert.equal(firstRes.statusCode, 401);
  assert.equal(secondRes.statusCode, 401);
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['first@example.com'],
    ['second@example.com'],
  ]);
  assert.equal(passwordHasher.compareCalls.length, 2);
});

test('login uses own socket and connection remote addresses with socket preferred', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'own-socket-rate-limit-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 1,
      windowMs: 60000,
      now: () => 1840,
    },
  });
  const socketIp = '203.0.113.70';
  const connectionIp = '203.0.113.71';

  const socketPreferredRes = await loginMissingAccount(
    login,
    {
      socket: { remoteAddress: socketIp },
      connection: { remoteAddress: connectionIp },
    },
    'socket-preferred@example.com'
  );
  const connectionRes = await loginMissingAccount(
    login,
    { connection: { remoteAddress: connectionIp } },
    'connection@example.com'
  );
  const blockedSocketRes = await loginMissingAccount(
    login,
    { socket: { remoteAddress: socketIp } },
    'socket-blocked@example.com'
  );
  const blockedConnectionRes = await loginMissingAccount(
    login,
    { connection: { remoteAddress: connectionIp } },
    'connection-blocked@example.com'
  );

  assert.equal(socketPreferredRes.statusCode, 401);
  assert.equal(connectionRes.statusCode, 401);
  assert.equal(blockedSocketRes.statusCode, 429);
  assert.deepEqual(blockedSocketRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(blockedConnectionRes.statusCode, 429);
  assert.deepEqual(blockedConnectionRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['socket-preferred@example.com'],
    ['connection@example.com'],
  ]);
  assert.equal(passwordHasher.compareCalls.length, 2);
});

test('login ignores array-shaped and primitive socket or connection sources', async () => {
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'malformed-socket-rate-limit-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1850,
    },
  });
  const arraySocket = Object.assign([], { remoteAddress: '203.0.113.80' });
  const arrayConnection = Object.assign([], { remoteAddress: '203.0.113.81' });

  const arrayRes = await loginMissingAccount(
    login,
    { socket: arraySocket, connection: arrayConnection },
    'array@example.com'
  );
  const primitiveRes = await loginMissingAccount(
    login,
    { socket: '203.0.113.82', connection: 12345 },
    'primitive@example.com'
  );
  const blockedRes = await loginMissingAccount(login, {}, 'unknown@example.com');

  assert.equal(arrayRes.statusCode, 401);
  assert.equal(primitiveRes.statusCode, 401);
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['array@example.com'],
    ['primitive@example.com'],
  ]);
  assert.equal(passwordHasher.compareCalls.length, 2);
});

test('login success does not clear source IP failures from rotated emails', async () => {
  const userRow = { id: 83, email: 'ada@example.com', password_hash: 'stored-user-hash' };
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [userRow] },
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const passwordHasher = createSequencePasswordHasher([false, true, false, false]);
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'source-rate-limit-reset-secret',
    passwordHasher,
    loginSourceRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => 1900,
    },
  });
  const sourceIp = '203.0.113.13';
  const password = 'candidate-password';

  const firstFailure = createRes();
  await login({ ip: sourceIp, body: { email: 'first@example.com', password } }, firstFailure);
  assert.equal(firstFailure.statusCode, 401);

  const success = createRes();
  await login(
    { ip: sourceIp, body: { email: 'ada@example.com', password: 'correct-password' } },
    success
  );
  assert.equal(success.statusCode, 200);
  assert.equal(verifyToken(success.body.token, 'source-rate-limit-reset-secret').userId, 83);

  const secondFailure = createRes();
  await login({ ip: sourceIp, body: { email: 'second@example.com', password } }, secondFailure);
  assert.equal(secondFailure.statusCode, 401);

  const blockedRes = createRes();
  await login({ ip: sourceIp, body: { email: 'third@example.com', password } }, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 3);
  assert.equal(passwordHasher.compareCalls.length, 3);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['first@example.com'],
    ['ada@example.com'],
    ['second@example.com'],
  ]);
});

test('login clears previous credential failures after a successful login', async () => {
  let now = 0;
  const userRow = { id: 81, email: 'ada@example.com', password_hash: 'stored-user-hash' };
  const db = createDb([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [userRow] },
    { rowCount: 1, rows: [userRow] },
    { rowCount: 1, rows: [userRow] },
    { rowCount: 1, rows: [userRow] },
    { rowCount: 1, rows: [userRow] },
  ]);
  const passwordHasher = createSequencePasswordHasher([false, false, true, false, false, false]);
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'rate-limit-reset-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 3,
      windowMs: 100,
      now: () => now,
    },
  });
  const sourceIp = '203.0.113.20';
  const password = 'candidate-password';
  const req = {
    ip: sourceIp,
    body: { email: 'ada@example.com', password },
  };

  const sourcePrelude = createRes();
  await login(
    { ip: sourceIp, body: { email: 'source-prelude@example.com', password } },
    sourcePrelude
  );
  assert.equal(sourcePrelude.statusCode, 401);

  now = 50;
  const firstFailure = createRes();
  await login(req, firstFailure);
  assert.equal(firstFailure.statusCode, 401);

  now = 60;
  const success = createRes();
  await login({ ...req, body: { ...req.body, password: 'correct-password' } }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(verifyToken(success.body.token, 'rate-limit-reset-secret').userId, 81);

  now = 101;
  const secondFailure = createRes();
  await login(req, secondFailure);
  assert.equal(secondFailure.statusCode, 401);

  now = 102;
  const thirdFailure = createRes();
  await login(req, thirdFailure);
  assert.equal(thirdFailure.statusCode, 401);

  now = 103;
  const fourthFailure = createRes();
  await login(req, fourthFailure);
  assert.equal(fourthFailure.statusCode, 401);
  assert.deepEqual(fourthFailure.body, { error: 'Invalid credentials' });
  assert.equal(db.calls.length, 6);
  assert.equal(passwordHasher.compareCalls.length, 6);
  assert.deepEqual(db.calls.map((call) => call.params), [
    ['source-prelude@example.com'],
    ['ada@example.com'],
    ['ada@example.com'],
    ['ada@example.com'],
    ['ada@example.com'],
    ['ada@example.com'],
  ]);
});

test('login allows attempts after the failure throttle window expires', async () => {
  let now = 3000;
  const userRow = { id: 82, email: 'ada@example.com', password_hash: 'stored-user-hash' };
  const db = createDb([
    { rowCount: 1, rows: [userRow] },
    { rowCount: 1, rows: [userRow] },
    { rowCount: 1, rows: [userRow] },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: false });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'rate-limit-window-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 2,
      windowMs: 60000,
      now: () => now,
    },
  });
  const req = {
    ip: '203.0.113.30',
    body: { email: 'ada@example.com', password: 'wrong-password' },
  };

  await login(req, createRes());
  await login(req, createRes());

  const blockedRes = createRes();
  await login(req, blockedRes);
  assert.equal(blockedRes.statusCode, 429);

  now += 60000;
  const retriedRes = createRes();
  await login(req, retriedRes);

  assert.equal(retriedRes.statusCode, 401);
  assert.equal(db.calls.length, 3);
  assert.equal(passwordHasher.compareCalls.length, 3);
});

test('login invalid input short-circuits before lookup or dummy comparison', async () => {
  const db = {
    calls: [],
    async query() {
      assert.fail('invalid login input must not query the database');
    },
  };
  const passwordHasher = {
    compareCalls: [],
    async compare(...args) {
      this.compareCalls.push(args);
      assert.fail('invalid login input must not compare any password hash');
    },
  };
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'invalid-short-circuit-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body: { email: 'invalid-email', password: 'correct-password' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Valid email is required' });
  assert.deepEqual(db.calls, []);
  assert.deepEqual(passwordHasher.compareCalls, []);
});

test('login rejects invalid input before querying or comparing', async (t) => {
  const cases = [
    {
      name: 'invalid email',
      body: { email: 'not-an-email', password: 's3cret' },
      error: 'Valid email is required',
    },
    {
      name: 'email with embedded whitespace',
      body: { email: 'grace\t@example.com', password: 's3cret' },
      error: 'Valid email is required',
    },
    {
      name: 'email with control character',
      body: { email: 'grace@example\u007f.com', password: 's3cret' },
      error: 'Valid email is required',
    },
    {
      name: 'email with C1 control character',
      body: { email: 'grace@example\u0085.com', password: 's3cret' },
      error: 'Valid email is required',
    },
    {
      name: 'email with invisible formatting mark',
      body: { email: 'grace@example\u202e.com', password: 's3cret' },
      error: 'Valid email is required',
    },
    {
      name: 'email with zero width space',
      body: { email: 'grace\u200b@example.com', password: 's3cret' },
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

test('login ignores inherited body fields before querying or comparing', async () => {
  const db = createDb([]);
  const passwordHasher = createPasswordHasher();
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'inherited-login-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({
    body: createBodyWithInheritedFields({
      email: 'grace@example.com',
      password: 's3cret',
    }),
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Valid email is required' });
  assert.deepEqual(db.calls, []);
  assert.deepEqual(passwordHasher.compareCalls, []);
});

test('login ignores accessor body fields before querying or comparing', async () => {
  const db = createDb([]);
  const passwordHasher = createPasswordHasher();
  const { object: body, accessCounts } = createObjectWithAccessorFields({
    email: 'grace@example.com',
    password: 'candidate-password',
  });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'accessor-login-secret',
    passwordHasher,
  });
  const res = createRes();

  await login({ body }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Valid email is required' });
  assert.deepEqual(accessCounts, {
    email: 0,
    password: 0,
  });
  assert.deepEqual(db.calls, []);
  assert.deepEqual(passwordHasher.compareCalls, []);
});

test('login ignores inherited request body container before querying, comparing, or rate tracking', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const passwordHasher = createPasswordHasher();
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'inherited-login-container-secret',
    passwordHasher,
    loginRateLimit: { maxFailures: 1, windowMs: 60000 },
  });
  const inheritedReq = createRequestWithInheritedFields({
    body: {
      email: 'grace@example.com',
      password: 'candidate-password',
    },
  });
  const inheritedRes = createRes();

  await login(inheritedReq, inheritedRes);

  assert.equal(inheritedRes.statusCode, 400);
  assert.deepEqual(inheritedRes.body, { error: 'Valid email is required' });
  assert.deepEqual(db.calls, []);
  assert.deepEqual(passwordHasher.compareCalls, []);

  const validRes = createRes();
  await login({
    body: {
      email: 'grace@example.com',
      password: 'candidate-password',
    },
  }, validRes);

  assert.equal(validRes.statusCode, 401);
  assert.deepEqual(validRes.body, { error: 'Invalid credentials' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['grace@example.com']);
  assert.equal(passwordHasher.compareCalls.length, 1);
});

test('login ignores accessor request body container before querying, comparing, or rate tracking', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const passwordHasher = createPasswordHasher();
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'accessor-login-container-secret',
    passwordHasher,
    loginRateLimit: { maxFailures: 1, windowMs: 60000 },
  });
  const accessorReq = {};
  let bodyAccessCount = 0;
  Object.defineProperty(accessorReq, 'body', {
    enumerable: true,
    get() {
      bodyAccessCount += 1;
      return {
        email: 'grace@example.com',
        password: 'candidate-password',
      };
    },
  });
  const accessorRes = createRes();

  await login(accessorReq, accessorRes);

  assert.equal(accessorRes.statusCode, 400);
  assert.deepEqual(accessorRes.body, { error: 'Valid email is required' });
  assert.equal(bodyAccessCount, 0);
  assert.deepEqual(db.calls, []);
  assert.deepEqual(passwordHasher.compareCalls, []);

  const validRes = createRes();
  await login({
    body: {
      email: 'grace@example.com',
      password: 'candidate-password',
    },
  }, validRes);

  assert.equal(validRes.statusCode, 401);
  assert.deepEqual(validRes.body, { error: 'Invalid credentials' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['grace@example.com']);
  assert.equal(passwordHasher.compareCalls.length, 1);
});

test('login treats inherited password hashes as invalid stored hashes', async () => {
  const row = Object.assign(Object.create({
    password_hash: 'stored-user-hash',
  }), {
    id: 80,
    email: 'ada@example.com',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [row],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'inherited-login-hash-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 1,
      windowMs: 60000,
      now: () => 1250,
    },
  });
  const req = {
    ip: '203.0.113.41',
    body: { email: 'ada@example.com', password: 'candidate-password' },
  };
  const res = createRes();

  await login(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Invalid credentials' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.compareCalls, [
    {
      password: 'candidate-password',
      passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
    },
  ]);

  const blockedRes = createRes();
  await login(req, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['ada@example.com']);
  assert.equal(passwordHasher.compareCalls.length, 1);
});

test('login treats accessor password hashes as invalid stored hashes', async () => {
  const row = createRowWithAccessorField({
    id: 80,
    email: 'ada@example.com',
    password_hash: 'stored-user-hash',
  }, 'password_hash');
  const db = createDb([
    {
      rowCount: 1,
      rows: [row],
    },
  ]);
  const passwordHasher = createPasswordHasher({ compareResult: true });
  const { login } = createAuthHandlers(db, {
    jwtSecret: 'accessor-login-hash-secret',
    passwordHasher,
    loginRateLimit: {
      maxFailures: 1,
      windowMs: 60000,
      now: () => 1250,
    },
  });
  const req = {
    ip: '203.0.113.42',
    body: { email: 'ada@example.com', password: 'candidate-password' },
  };
  const res = createRes();

  await login(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Invalid credentials' });
  assert.equal(res.body.token, undefined);
  assert.deepEqual(passwordHasher.compareCalls, [
    {
      password: 'candidate-password',
      passwordHash: MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
    },
  ]);

  const blockedRes = createRes();
  await login(req, blockedRes);

  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, { error: LOGIN_RATE_LIMIT_ERROR });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['ada@example.com']);
  assert.equal(passwordHasher.compareCalls.length, 1);
});

test('login trims surrounding email whitespace before credential lookup', async () => {
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

  await login({ body: { email: '\r\n\t GRACE@Example.COM \n', password: 's3cret' } }, res);

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

test('signToken requires a usable userId claim before issuing a token', () => {
  const invalidPayloads = [
    undefined,
    null,
    {},
    [],
    { userId: null },
    { userId: '' },
    { userId: '   ' },
    { userId: 'not-a-number' },
    { userId: '1.5' },
    { userId: '0' },
    { userId: 0 },
    { userId: -1 },
    { userId: 1.5 },
    { userId: String(MAX_POSTGRES_SERIAL_ID + 1) },
    { userId: MAX_POSTGRES_SERIAL_ID + 1 },
    { userId: String(Number.MAX_SAFE_INTEGER) },
    { userId: String(Number.MAX_SAFE_INTEGER + 1) },
    { userId: Number.MAX_SAFE_INTEGER + 1 },
  ];

  for (const payload of invalidPayloads) {
    assert.throws(
      () => signToken(payload, 'sign-user-secret', { now: 1000, expiresInSeconds: 60 }),
      /Token userId is required/
    );
  }
});

test('signToken canonicalizes signed userId claims to positive integers', () => {
  const token = signToken({ userId: ' 00042 ' }, 'canonical-user-secret', {
    now: 1000,
    expiresInSeconds: 60,
  });
  const payload = decodeJwtPayload(token);

  assert.deepEqual(payload, {
    userId: 42,
    iat: 1000,
    exp: 1060,
  });
  assert.deepEqual(verifyToken(token, 'canonical-user-secret', { now: 1000 }), payload);
});

test('signToken omits unsupported caller payload fields from issued tokens', () => {
  const token = signToken(
    {
      userId: 42,
      role: 'learner',
      email: 'ada@example.com',
      password_hash: 'stored-hash',
    },
    'unsupported-fields-secret',
    {
      now: 1000,
      expiresInSeconds: 60,
    }
  );
  const payload = decodeJwtPayload(token);

  assert.equal(Object.hasOwn(payload, 'role'), false);
  assert.equal(Object.hasOwn(payload, 'email'), false);
  assert.equal(Object.hasOwn(payload, 'password_hash'), false);
  assert.deepEqual(payload, {
    userId: 42,
    iat: 1000,
    exp: 1060,
  });
});

test('verifyToken rejects signed tokens with unsupported payload fields', () => {
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      userId: 107,
      iat: 1000,
      exp: 2000,
      role: 'admin',
      email: 'ada@example.com',
      password_hash: 'stored-hash',
    },
    'unsupported-payload-secret'
  );

  assert.throws(
    () => verifyToken(token, 'unsupported-payload-secret', { now: 1000 }),
    /Unsupported token payload/
  );
});

test('signToken ignores caller-supplied iat and exp claims in favor of computed values', () => {
  const token = signToken(
    {
      userId: 42,
      iat: 1,
      exp: 2,
    },
    'computed-time-secret',
    {
      now: 1000,
      expiresInSeconds: 60,
    }
  );
  const payload = decodeJwtPayload(token);

  assert.equal(payload.iat, 1000);
  assert.equal(payload.exp, 1060);
  assert.deepEqual(payload, {
    userId: 42,
    iat: 1000,
    exp: 1060,
  });
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

test('verifyToken rejects missing, malformed, and out-of-order issued-at claims', () => {
  const invalidIssuedAtClaims = [
    {
      label: 'missing',
      payload: { userId: 101, exp: 2000 },
      message: /Token issued-at is required/,
    },
    {
      label: 'fractional',
      payload: { userId: 101, iat: 1000.5, exp: 2000 },
      message: /Token issued-at must be a non-negative safe integer/,
    },
    {
      label: 'string',
      payload: { userId: 101, iat: '1000', exp: 2000 },
      message: /Token issued-at must be a non-negative safe integer/,
    },
    {
      label: 'unsafe',
      payload: { userId: 101, iat: Number.MAX_SAFE_INTEGER + 1, exp: 2000 },
      message: /Token issued-at must be a non-negative safe integer/,
    },
    {
      label: 'negative',
      payload: { userId: 101, iat: -1, exp: 2000 },
      message: /Token issued-at must be a non-negative safe integer/,
    },
    {
      label: 'equal to exp',
      payload: { userId: 101, iat: 2000, exp: 2000 },
      message: /Token issued-at must be before expiration/,
    },
    {
      label: 'after exp',
      payload: { userId: 101, iat: 2001, exp: 2000 },
      message: /Token issued-at must be before expiration/,
    },
  ];

  for (const { label, payload, message } of invalidIssuedAtClaims) {
    const token = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      payload,
      'strict-iat-secret'
    );

    assert.throws(
      () => verifyToken(token, 'strict-iat-secret', { now: 1000 }),
      message,
      label
    );
  }
});

test('signToken rejects malformed issued-at options before issuing a token', () => {
  for (const now of [-1, 1000.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => signToken({ userId: 101 }, 'sign-iat-secret', { now, expiresInSeconds: 60 }),
      /Token issued-at must be a non-negative safe integer/,
      String(now)
    );
  }
});

test('verifyToken accepts PostgreSQL SERIAL userId claims as canonical numbers', () => {
  const validClaims = [
    1,
    42,
    MAX_POSTGRES_SERIAL_ID,
  ];

  for (const userId of validClaims) {
    const token = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { userId, iat: 1000, exp: 2000 },
      'numeric-user-secret'
    );

    assert.deepEqual(
      verifyToken(token, 'numeric-user-secret', { now: 1000 }),
      {
        userId,
        iat: 1000,
        exp: 2000,
      },
      `canonical numeric userId ${userId}`
    );
  }
});

test('verifyToken rejects signed noncanonical string userId claims', () => {
  const invalidUserIdClaims = [
    { label: 'numeric string', userId: '42' },
    { label: 'whitespace string', userId: ' 43 ' },
    { label: 'zero-padded string', userId: '00044' },
    { label: 'upper-boundary string', userId: String(MAX_POSTGRES_SERIAL_ID) },
  ];

  for (const { label, userId } of invalidUserIdClaims) {
    const token = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { userId, iat: 1000, exp: 2000 },
      'string-user-secret'
    );

    assert.throws(
      () => verifyToken(token, 'string-user-secret', { now: 1000 }),
      /Token userId is required/,
      label
    );
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

test('verifyToken requires the API-issued JWT header contract', () => {
  const validPayload = { userId: 105, iat: 1000, exp: 2000 };
  const tokenWithoutType = signRawJwt(
    { alg: 'HS256' },
    validPayload,
    'strict-header-secret'
  );
  const tokenWithWrongType = signRawJwt(
    { alg: 'HS256', typ: 'JWS' },
    validPayload,
    'strict-header-secret'
  );
  const tokenWithCriticalHeader = signRawJwt(
    { alg: 'HS256', typ: 'JWT', crit: ['exp'] },
    validPayload,
    'strict-header-secret'
  );

  assert.throws(
    () => verifyToken(tokenWithoutType, 'strict-header-secret', { now: 1000 }),
    /Invalid token type/
  );
  assert.throws(
    () => verifyToken(tokenWithWrongType, 'strict-header-secret', { now: 1000 }),
    /Invalid token type/
  );
  assert.throws(
    () => verifyToken(tokenWithCriticalHeader, 'strict-header-secret', { now: 1000 }),
    /Unsupported token header/
  );
});

test('verifyToken requires JWT header claims as own properties', () => {
  const payload = { userId: 105, iat: 1000, exp: 2000 };

  withObjectPrototypeProperties({ alg: 'HS256', typ: 'JWT' }, () => {
    const tokenWithoutAlgorithm = signRawJwt(
      { typ: 'JWT' },
      payload,
      'own-header-secret'
    );
    const tokenWithoutType = signRawJwt(
      { alg: 'HS256' },
      payload,
      'own-header-secret'
    );

    assert.throws(
      () => verifyToken(tokenWithoutAlgorithm, 'own-header-secret', { now: 1000 }),
      /Invalid token algorithm/
    );
    assert.throws(
      () => verifyToken(tokenWithoutType, 'own-header-secret', { now: 1000 }),
      /Invalid token type/
    );
  });
});

test('verifyToken accepts signed own claims when Object.prototype has JWT claim pollution', () => {
  const payload = { userId: 106, iat: 1000, exp: 2000 };
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    payload,
    'polluted-own-claims-secret'
  );

  withObjectPrototypeProperties(
    { alg: 'HS512', typ: 'JWS', userId: 999, iat: 9999, exp: 9999 },
    () => {
      assert.deepEqual(
        verifyToken(token, 'polluted-own-claims-secret', { now: 1000 }),
        payload
      );
    }
  );
});

test('verifyToken accepts signed tokens with exactly the allowed JWT header fields', () => {
  const payload = { userId: 106, iat: 1000, exp: 2000 };
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    payload,
    'strict-header-happy-path-secret'
  );

  assert.deepEqual(
    verifyToken(token, 'strict-header-happy-path-secret', { now: 1000 }),
    payload
  );
});

test('verifyToken rejects signed tokens with unsupported JWT header fields', () => {
  const payload = { userId: 107, iat: 1000, exp: 2000 };
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT', kid: 'active-key' },
    payload,
    'extra-header-secret'
  );

  assert.throws(
    () => verifyToken(token, 'extra-header-secret', { now: 1000 }),
    /Unsupported token header/
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

test('verifyToken rejects wrong-shape and empty-part compact tokens before decoding', () => {
  const secret = 'malformed-compact-token-secret';
  const encodedHeader = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = base64UrlJson({ userId: 101, iat: 1000, exp: 2000 });

  for (const token of [
    `${encodedHeader}.${encodedPayload}`,
    signRawJwtSegments(encodedHeader, '', secret),
  ]) {
    assert.throws(
      () => verifyToken(token, secret, { now: 1000 }),
      { message: 'Invalid token' }
    );
  }
});

test('verifyToken rejects signed tokens with non-base64url compact segments', () => {
  const secret = 'strict-compact-token-secret';
  const encodedHeader = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = base64UrlJson({ userId: 101, iat: 1000, exp: 2000 });
  const nonCanonicalHeader = `${encodedHeader}!`;
  const nonCanonicalPayload = `${encodedPayload}=`;

  assert.equal(
    Buffer.from(nonCanonicalHeader, 'base64url').toString('utf8'),
    Buffer.from(encodedHeader, 'base64url').toString('utf8')
  );
  assert.equal(
    Buffer.from(nonCanonicalPayload, 'base64url').toString('utf8'),
    Buffer.from(encodedPayload, 'base64url').toString('utf8')
  );

  for (const token of [
    signRawJwtSegments(nonCanonicalHeader, encodedPayload, secret),
    signRawJwtSegments(encodedHeader, nonCanonicalPayload, secret),
  ]) {
    assert.throws(
      () => verifyToken(token, secret, { now: 1000 }),
      /Invalid token/
    );
  }
});

test('verifyToken rejects compact segments with impossible base64url lengths before decoding', () => {
  const secret = 'strict-base64url-length-secret';
  const encodedHeader = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = base64UrlJson({ userId: 101, iat: 1000, exp: 2000 });
  const nonCanonicalHeader = `${encodedHeader}a`;
  const nonCanonicalPayload = `${encodedPayload}a`;
  const encodedSignature = signRawJwtSegments(encodedHeader, encodedPayload, secret).split('.')[2];
  const nonCanonicalSignature = `${encodedSignature}aa`;

  assert.equal(nonCanonicalHeader.length % 4, 1);
  assert.equal(nonCanonicalPayload.length % 4, 1);
  assert.equal(nonCanonicalSignature.length % 4, 1);
  assert.equal(
    Buffer.from(nonCanonicalHeader, 'base64url').toString('utf8'),
    Buffer.from(encodedHeader, 'base64url').toString('utf8')
  );
  assert.equal(
    Buffer.from(nonCanonicalPayload, 'base64url').toString('utf8'),
    Buffer.from(encodedPayload, 'base64url').toString('utf8')
  );

  for (const token of [
    signRawJwtSegments(nonCanonicalHeader, encodedPayload, secret),
    signRawJwtSegments(encodedHeader, nonCanonicalPayload, secret),
    `${encodedHeader}.${encodedPayload}.${nonCanonicalSignature}`,
  ]) {
    assert.throws(
      () => verifyToken(token, secret, { now: 1000 }),
      { message: 'Invalid token' }
    );
  }
});

test('verifyToken rejects signed tokens without a usable userId claim', () => {
  const invalidPayloads = [
    { label: 'missing userId', payload: { iat: 1000, exp: 2000 } },
    { label: 'null userId', payload: { userId: null, iat: 1000, exp: 2000 } },
    { label: 'empty string userId', payload: { userId: '', iat: 1000, exp: 2000 } },
    { label: 'blank string userId', payload: { userId: '   ', iat: 1000, exp: 2000 } },
    {
      label: 'nonnumeric string userId',
      payload: { userId: 'not-a-number', iat: 1000, exp: 2000 },
    },
    { label: 'fractional string userId', payload: { userId: '1.5', iat: 1000, exp: 2000 } },
    { label: 'zero string userId', payload: { userId: '0', iat: 1000, exp: 2000 } },
    { label: 'zero numeric userId', payload: { userId: 0, iat: 1000, exp: 2000 } },
    { label: 'negative numeric userId', payload: { userId: -1, iat: 1000, exp: 2000 } },
    { label: 'fractional numeric userId', payload: { userId: 1.5, iat: 1000, exp: 2000 } },
    {
      label: 'over-boundary string userId',
      payload: { userId: String(MAX_POSTGRES_SERIAL_ID + 1), iat: 1000, exp: 2000 },
    },
    {
      label: 'over-boundary numeric userId',
      payload: { userId: MAX_POSTGRES_SERIAL_ID + 1, iat: 1000, exp: 2000 },
    },
    {
      label: 'unsafe string userId',
      payload: { userId: String(Number.MAX_SAFE_INTEGER), iat: 1000, exp: 2000 },
    },
    {
      label: 'unsafe numeric userId',
      payload: { userId: Number.MAX_SAFE_INTEGER, iat: 1000, exp: 2000 },
    },
    {
      label: 'beyond safe string userId',
      payload: { userId: String(Number.MAX_SAFE_INTEGER + 1), iat: 1000, exp: 2000 },
    },
    {
      label: 'beyond safe numeric userId',
      payload: { userId: Number.MAX_SAFE_INTEGER + 1, iat: 1000, exp: 2000 },
    },
    { label: 'array userId', payload: { userId: [], iat: 1000, exp: 2000 } },
    { label: 'object userId', payload: { userId: {}, iat: 1000, exp: 2000 } },
  ];

  for (const { label, payload } of invalidPayloads) {
    const token = signRawJwt({ alg: 'HS256', typ: 'JWT' }, payload, 'user-claim-secret');

    assert.throws(
      () => verifyToken(token, 'user-claim-secret', { now: 1000 }),
      /Token userId is required/,
      label
    );
  }
});

test('verifyToken requires JWT payload claims as own properties', () => {
  withObjectPrototypeProperties({ userId: 108, iat: 1000, exp: 2000 }, () => {
    const tokenWithoutUserId = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { iat: 1000, exp: 2000 },
      'own-payload-secret'
    );
    const tokenWithoutIssuedAt = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { userId: 108, exp: 2000 },
      'own-payload-secret'
    );
    const tokenWithoutExpiration = signRawJwt(
      { alg: 'HS256', typ: 'JWT' },
      { userId: 108, iat: 1000 },
      'own-payload-secret'
    );

    assert.throws(
      () => verifyToken(tokenWithoutUserId, 'own-payload-secret', { now: 1000 }),
      /Token userId is required/
    );
    assert.throws(
      () => verifyToken(tokenWithoutIssuedAt, 'own-payload-secret', { now: 1000 }),
      /Token issued-at is required/
    );
    assert.throws(
      () => verifyToken(tokenWithoutExpiration, 'own-payload-secret', { now: 1000 }),
      /Token expiration is required/
    );
  });
});

test('extractBearerToken accepts only a single bearer credential', () => {
  assert.equal(extractBearerToken('Bearer token-123'), 'token-123');
  assert.equal(extractBearerToken('  bearer   token-123  '), 'token-123');
  assert.equal(extractBearerToken('\tbearer\ttoken-123\t'), 'token-123');
  assert.equal(extractBearerToken('BEARER abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('Bearer abc=='), 'abc==');

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
    'Bearer abc=def',
    '\nBearer token-123',
    'Bearer\r\n token-123',
    'Bearer token-123\r\n',
    'Bearer token\u0000123',
    'Bearer token\u007f123',
    'Bearer token\u00a0123',
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

test('createAuthHandlers validates and canonicalizes explicit jwtSecret options', () => {
  const passwordHasher = createPasswordHasher();
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: '  configured-secret\n\t',
    passwordHasher,
  });
  const req = {
    headers: { authorization: `Bearer ${signToken({ userId: 203 }, 'configured-secret')}` },
  };
  let nextCalled = false;

  authenticateToken(req, createRes(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 203);

  for (const jwtSecret of ['', ' \n\t ']) {
    assert.throws(
      () => createAuthHandlers(createDb([]), { jwtSecret, passwordHasher }),
      /JWT_SECRET must not be empty/
    );
  }

  for (const jwtSecret of [null, 12345]) {
    assert.throws(
      () => createAuthHandlers(createDb([]), { jwtSecret, passwordHasher }),
      { name: 'TypeError', message: 'JWT_SECRET must be a string' }
    );
  }
});

test('createAuthHandlers lets undefined jwtSecret fall back to env JWT_SECRET', () => {
  const passwordHasher = createPasswordHasher();
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: undefined,
    env: { JWT_SECRET: 'env-secret' },
    passwordHasher,
  });
  const req = {
    headers: { authorization: `Bearer ${signToken({ userId: 204 }, 'env-secret')}` },
  };
  let nextCalled = false;

  authenticateToken(req, createRes(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 204);
});

test('createAuthHandlers ignores inherited env JWT_SECRET before authenticating tokens', () => {
  withObjectPrototypeProperties({ JWT_SECRET: 'polluted-auth-secret' }, () => {
    const { authenticateToken } = createAuthHandlers(createDb([]), {
      env: {},
      passwordHasher: createPasswordHasher(),
    });
    const inheritedSecretReq = {
      headers: { authorization: `Bearer ${signToken({ userId: 205 }, 'polluted-auth-secret')}` },
    };
    const inheritedSecretRes = createRes();
    let inheritedSecretNextCalled = false;

    authenticateToken(inheritedSecretReq, inheritedSecretRes, () => {
      inheritedSecretNextCalled = true;
    });

    assert.equal(inheritedSecretRes.statusCode, 403);
    assert.equal(inheritedSecretNextCalled, false);
    assert.equal(inheritedSecretReq.user, undefined);

    const defaultSecretReq = {
      headers: { authorization: `Bearer ${signToken({ userId: 206 }, DEFAULT_DEV_JWT_SECRET)}` },
    };
    let defaultSecretNextCalled = false;

    authenticateToken(defaultSecretReq, createRes(), () => {
      defaultSecretNextCalled = true;
    });

    assert.equal(defaultSecretNextCalled, true);
    assert.equal(defaultSecretReq.user.userId, 206);
  });
});

test('authenticateToken accepts API-issued numeric userId claims as numbers', () => {
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

test('authenticateToken rejects signed noncanonical string userId claims', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'string-auth-secret',
    passwordHasher: createPasswordHasher(),
  });
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      userId: '302',
      iat: 1000,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    'string-auth-secret'
  );
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

test('authenticateToken exposes only the authorized request principal shape', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'principal-shape-secret',
    passwordHasher: createPasswordHasher(),
  });
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      userId: 303,
      iat: 1000,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    'principal-shape-secret'
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { userId: 303 });
});

test('authenticateToken rejects signed tokens with unsupported payload claims', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'unsupported-auth-payload-secret',
    passwordHasher: createPasswordHasher(),
  });
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      userId: 304,
      iat: 1000,
      exp: Math.floor(Date.now() / 1000) + 60,
      role: 'admin',
      email: 'ada@example.com',
    },
    'unsupported-auth-payload-secret'
  );
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
    `\nBearer ${signedToken}`,
    `Bearer\r\n ${signedToken}`,
    `Bearer ${signedToken}\r\n`,
    `Bearer ${signedToken.slice(0, 8)}\u0000${signedToken.slice(8)}`,
    `Bearer ${signedToken.slice(0, 8)}\u007f${signedToken.slice(8)}`,
    `Bearer ${signedToken.slice(0, 8)}\u00a0${signedToken.slice(8)}`,
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

test('authenticateToken ignores inherited-only authorization headers', () => {
  const signedToken = signToken({ userId: 305 }, 'inherited-header-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'inherited-header-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = {
    headers: Object.create({ authorization: `Bearer ${signedToken}` }),
  };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(req.user, undefined);
});

test('authenticateToken ignores accessor authorization headers', () => {
  const signedToken = signToken({ userId: 305 }, 'accessor-header-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'accessor-header-secret',
    passwordHasher: createPasswordHasher(),
  });
  const { object: headers, accessCounts } = createObjectWithAccessorFields({
    authorization: `Bearer ${signedToken}`,
  });
  const req = { headers };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(accessCounts.authorization, 0);
  assert.equal(nextCalled, false);
  assert.equal(req.user, undefined);
});

test('authenticateToken ignores an inherited-only request headers container', () => {
  const signedToken = signToken({ userId: 305 }, 'inherited-headers-container-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'inherited-headers-container-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = Object.create({
    headers: { authorization: `Bearer ${signedToken}` },
  });
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(req.user, undefined);
});

test('authenticateToken ignores an accessor request headers container without invoking getters', () => {
  const signedToken = signToken({ userId: 305 }, 'accessor-headers-container-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'accessor-headers-container-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = {};
  let headersAccessCount = 0;
  Object.defineProperty(req, 'headers', {
    enumerable: true,
    get() {
      headersAccessCount += 1;
      return { authorization: `Bearer ${signedToken}` };
    },
  });
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(headersAccessCount, 0);
  assert.equal(nextCalled, false);
  assert.equal(req.user, undefined);
});

test('authenticateToken accepts own authorization over an inherited forged header', () => {
  const signedToken = signToken({ userId: 306 }, 'own-header-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'own-header-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = {
    headers: Object.assign(Object.create({ authorization: 'Bearer forged-token' }), {
      authorization: `Bearer ${signedToken}`,
    }),
  };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 306);
});

test('authenticateToken ignores array-shaped headers with an authorization property', () => {
  const signedToken = signToken({ userId: 307 }, 'array-header-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'array-header-secret',
    passwordHasher: createPasswordHasher(),
  });
  const headers = [];
  headers.authorization = `Bearer ${signedToken}`;
  const req = { headers };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(req.user, undefined);
});

test('authenticateToken accepts a valid own authorization header', () => {
  const signedToken = signToken({ userId: 308 }, 'valid-own-header-secret');
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'valid-own-header-secret',
    passwordHasher: createPasswordHasher(),
  });
  const req = { headers: { authorization: `Bearer ${signedToken}` } };
  const res = createRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 308);
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

test('authenticateToken rejects signed userId claims outside the database id range', () => {
  const { authenticateToken } = createAuthHandlers(createDb([]), {
    jwtSecret: 'oversized-user-secret',
    passwordHasher: createPasswordHasher(),
  });
  const token = signRawJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      userId: String(MAX_POSTGRES_SERIAL_ID + 1),
      iat: 1000,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    'oversized-user-secret'
  );
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

test('resolveJwtSecret requires own data-property env fields', () => {
  withObjectPrototypeProperties({
    JWT_SECRET: 'polluted-secret',
    NODE_ENV: 'production',
  }, () => {
    assert.equal(resolveJwtSecret({}), DEFAULT_DEV_JWT_SECRET);
    assert.throws(
      () => resolveJwtSecret({ NODE_ENV: 'production' }),
      /JWT_SECRET must be set in production/
    );
    assert.equal(resolveJwtSecret({ JWT_SECRET: 'own-secret' }), 'own-secret');
  });

  const { object: accessorEnv, accessCounts } = createObjectWithAccessorFields({
    JWT_SECRET: 'accessor-secret',
    NODE_ENV: 'production',
  });

  assert.equal(resolveJwtSecret(accessorEnv), DEFAULT_DEV_JWT_SECRET);
  assert.equal(accessCounts.JWT_SECRET, 0);
  assert.equal(accessCounts.NODE_ENV, 0);
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

test('resolveJwtSecret rejects the deterministic development secret in production', () => {
  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: DEFAULT_DEV_JWT_SECRET, NODE_ENV: 'production' }),
    /JWT_SECRET must not use the default development secret in production/
  );
  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: `  ${DEFAULT_DEV_JWT_SECRET}\n`, NODE_ENV: 'production' }),
    /JWT_SECRET must not use the default development secret in production/
  );
});

test('resolveJwtSecret rejects short production secrets after trimming', () => {
  assert.equal(JWT_SECRET_MIN_PRODUCTION_BYTES, 32);

  const shortProductionSecret = 'a'.repeat(JWT_SECRET_MIN_PRODUCTION_BYTES - 1);
  const boundaryProductionSecret = 'b'.repeat(JWT_SECRET_MIN_PRODUCTION_BYTES);

  assert.equal(Buffer.byteLength(shortProductionSecret, 'utf8'), JWT_SECRET_MIN_PRODUCTION_BYTES - 1);
  assert.equal(Buffer.byteLength(boundaryProductionSecret, 'utf8'), JWT_SECRET_MIN_PRODUCTION_BYTES);

  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: `  ${shortProductionSecret}\n`, NODE_ENV: 'production' }),
    { message: JWT_SECRET_MIN_PRODUCTION_BYTES_ERROR }
  );

  assert.equal(
    resolveJwtSecret({ JWT_SECRET: `  ${boundaryProductionSecret}\n`, NODE_ENV: 'production' }),
    boundaryProductionSecret
  );
});

test('resolveJwtSecret continues to allow short explicit secrets outside production', () => {
  assert.equal(resolveJwtSecret({ JWT_SECRET: 'short-secret', NODE_ENV: 'test' }), 'short-secret');
});

test('resolveJwtSecret falls back to the deterministic dev secret outside production', () => {
  assert.equal(resolveJwtSecret({ NODE_ENV: 'test' }), DEFAULT_DEV_JWT_SECRET);
  assert.equal(resolveJwtSecret({ NODE_ENV: 'development' }), DEFAULT_DEV_JWT_SECRET);
  assert.equal(resolveJwtSecret({}), DEFAULT_DEV_JWT_SECRET);
});

test('createAuthHandlers rejects an explicit development JWT secret in production', () => {
  assert.throws(
    () => createAuthHandlers(createDb([]), {
      env: { NODE_ENV: 'production' },
      jwtSecret: DEFAULT_DEV_JWT_SECRET,
      passwordHasher: createPasswordHasher(),
    }),
    /JWT_SECRET must not use the default development secret in production/
  );
});

test('createAuthHandlers rejects an explicit short JWT secret in production', () => {
  assert.throws(
    () => createAuthHandlers(createDb([]), {
      env: { NODE_ENV: 'production' },
      jwtSecret: 'a'.repeat(JWT_SECRET_MIN_PRODUCTION_BYTES - 1),
      passwordHasher: createPasswordHasher(),
    }),
    { message: JWT_SECRET_MIN_PRODUCTION_BYTES_ERROR }
  );
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

test('resolveJwtExpiresInSeconds ignores inherited and accessor env values', () => {
  withObjectPrototypeProperties({ JWT_EXPIRES_IN_SECONDS: '120' }, () => {
    assert.equal(resolveJwtExpiresInSeconds({}), DEFAULT_JWT_EXPIRES_IN_SECONDS);
  });

  const { object: accessorEnv, accessCounts } = createObjectWithAccessorFields({
    JWT_EXPIRES_IN_SECONDS: '120',
  });

  assert.equal(resolveJwtExpiresInSeconds(accessorEnv), DEFAULT_JWT_EXPIRES_IN_SECONDS);
  assert.equal(accessCounts.JWT_EXPIRES_IN_SECONDS, 0);
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
