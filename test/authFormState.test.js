const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_MODES,
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_USERNAME_MAX_LENGTH,
  AUTH_TOKEN_STORAGE_KEY,
  cleanupStoredAuthTokenIfNeeded,
  createInitialAuthSession,
  createAuthRequest,
  createAuthSubmission,
  getAuthEndpoint,
  getNextAuthMode,
  parseAuthResponse,
  resolveApiBaseUrl,
  validateAuthInput,
} = require('../authFormState');
const { AUTH_TOKEN_MAX_LENGTH } = require('../authTokenValidation');

const LOCAL_ENV = Object.freeze({});

function createEmailWithLength(totalLength) {
  const domain = '@example.com';
  return `${'a'.repeat(totalLength - domain.length)}${domain}`;
}

test('getNextAuthMode toggles between login and register modes', () => {
  assert.equal(getNextAuthMode(AUTH_MODES.LOGIN), AUTH_MODES.REGISTER);
  assert.equal(getNextAuthMode(AUTH_MODES.REGISTER), AUTH_MODES.LOGIN);
});

test('createInitialAuthSession reads and trims a usable stored token', () => {
  const requestedKeys = [];
  const storage = {
    getItem(key) {
      requestedKeys.push(key);
      return '  abc.def.ghi  ';
    },
  };

  assert.deepEqual(createInitialAuthSession(storage), {
    isLoggedIn: true,
    token: 'abc.def.ghi',
    cleanupNeeded: false,
  });
  assert.deepEqual(requestedKeys, [AUTH_TOKEN_STORAGE_KEY]);
});

test('createInitialAuthSession accepts a max-length stored token', () => {
  const token = 'a'.repeat(AUTH_TOKEN_MAX_LENGTH);

  assert.deepEqual(createInitialAuthSession({ getItem: () => token }), {
    isLoggedIn: true,
    token,
    cleanupNeeded: false,
  });
});

test('createInitialAuthSession treats missing tokens as logged out without cleanup', () => {
  for (const token of [null, undefined]) {
    assert.deepEqual(createInitialAuthSession({ getItem: () => token }), {
      isLoggedIn: false,
      token: '',
      cleanupNeeded: false,
    });
  }

  assert.deepEqual(createInitialAuthSession(), {
    isLoggedIn: false,
    token: '',
    cleanupNeeded: false,
  });
});

test('createInitialAuthSession treats blank stored tokens as cleanup-needed logout', () => {
  for (const token of ['', '   ']) {
    assert.deepEqual(createInitialAuthSession({ getItem: () => token }), {
      isLoggedIn: false,
      token: '',
      cleanupNeeded: true,
    });
  }
});

test('createInitialAuthSession treats unsafe stored tokens as cleanup-needed logout', () => {
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
      createInitialAuthSession({ getItem: () => token }),
      {
        isLoggedIn: false,
        token: '',
        cleanupNeeded: true,
      },
      `Expected token ${JSON.stringify(token.slice(0, 24))} to require cleanup`
    );
  }
});

test('createInitialAuthSession treats non-string stored tokens as cleanup-needed logout', () => {
  for (const token of [0, 1, false, true, {}, []]) {
    assert.deepEqual(createInitialAuthSession({ getItem: () => token }), {
      isLoggedIn: false,
      token: '',
      cleanupNeeded: true,
    });
  }
});

test('createInitialAuthSession handles throwing token reads as cleanup-needed logout', () => {
  const expectedSession = {
    isLoggedIn: false,
    token: '',
    cleanupNeeded: true,
  };

  assert.deepEqual(createInitialAuthSession(() => {
    throw new Error('storage unavailable');
  }), expectedSession);
  assert.deepEqual(createInitialAuthSession({
    getItem() {
      throw new Error('storage unavailable');
    },
  }), expectedSession);
});

test('cleanupStoredAuthTokenIfNeeded removes bad stored tokens best-effort', () => {
  const removedKeys = [];
  const storage = {
    removeItem(key) {
      removedKeys.push(key);
    },
  };

  assert.equal(
    cleanupStoredAuthTokenIfNeeded(storage, {
      isLoggedIn: false,
      token: '',
      cleanupNeeded: true,
    }),
    true
  );
  assert.deepEqual(removedKeys, [AUTH_TOKEN_STORAGE_KEY]);
});

test('cleanupStoredAuthTokenIfNeeded skips usable sessions and swallows cleanup failures', () => {
  const usableSession = {
    isLoggedIn: true,
    token: 'abc.def.ghi',
    cleanupNeeded: false,
  };
  let removeCalls = 0;

  assert.equal(cleanupStoredAuthTokenIfNeeded({
    removeItem() {
      removeCalls += 1;
    },
  }, usableSession), false);
  assert.equal(removeCalls, 0);
  assert.equal(
    cleanupStoredAuthTokenIfNeeded({}, {
      isLoggedIn: false,
      token: '',
      cleanupNeeded: true,
    }),
    false
  );
  assert.equal(
    cleanupStoredAuthTokenIfNeeded({
      removeItem() {
        throw new Error('remove failed');
      },
    }, {
      isLoggedIn: false,
      token: '',
      cleanupNeeded: true,
    }),
    false
  );
});

test('createAuthRequest selects login endpoint and body', () => {
  assert.deepEqual(
    createAuthRequest({
      mode: AUTH_MODES.LOGIN,
      email: '  ADA@example.com  ',
      password: 's3cret',
      env: LOCAL_ENV,
    }),
    {
      ok: true,
      url: getAuthEndpoint(AUTH_MODES.LOGIN, LOCAL_ENV),
      body: {
        email: 'ADA@example.com',
        password: 's3cret',
      },
    }
  );
});

test('createAuthRequest selects register endpoint and derives username from trimmed email', () => {
  assert.deepEqual(
    createAuthRequest({
      mode: AUTH_MODES.REGISTER,
      email: '  Grace@Example.COM  ',
      password: 'long-password',
      env: LOCAL_ENV,
    }),
    {
      ok: true,
      url: getAuthEndpoint(AUTH_MODES.REGISTER, LOCAL_ENV),
      body: {
        username: 'Grace@Example.COM',
        email: 'Grace@Example.COM',
        password: 'long-password',
      },
    }
  );
});

test('resolveApiBaseUrl falls back to the local development URL', () => {
  assert.equal(resolveApiBaseUrl(), 'http://localhost:3001');
  assert.equal(resolveApiBaseUrl(LOCAL_ENV), 'http://localhost:3001');
  assert.equal(getAuthEndpoint(AUTH_MODES.LOGIN), 'http://localhost:3001/api/login');
});

test('createAuthRequest uses configured API base URL without trailing slashes', () => {
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: 'https://api.example.test///' }),
    'https://api.example.test'
  );
  assert.equal(
    getAuthEndpoint(AUTH_MODES.REGISTER, {
      REACT_APP_API_BASE_URL: 'https://api.example.test///',
    }),
    'https://api.example.test/api/register'
  );
  assert.equal(
    createAuthRequest({
      mode: AUTH_MODES.LOGIN,
      email: 'ada@example.com',
      password: 's3cret',
      env: {
        REACT_APP_API_BASE_URL: 'https://api.example.test///',
      },
    }).url,
    'https://api.example.test/api/login'
  );
});

test('resolveApiBaseUrl preserves safe HTTP origins and path prefixes', () => {
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: 'http://localhost:3001///' }),
    'http://localhost:3001'
  );
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: '  https://api.example.test/v1///  ' }),
    'https://api.example.test/v1'
  );
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: '/backend///' }),
    '/backend'
  );
  assert.equal(
    getAuthEndpoint(AUTH_MODES.LOGIN, { REACT_APP_API_BASE_URL: '/backend///' }),
    '/backend/api/login'
  );
});

test('resolveApiBaseUrl preserves safe relative API base path characters', () => {
  const safeRelativePaths = [
    '/backend/v1',
    '/backend/v1-._~',
    '/backend/!$&()*+,;=:@',
    '/backend/%7Eteam/%27quote%22/%7btenant%7d',
  ];

  for (const REACT_APP_API_BASE_URL of safeRelativePaths) {
    assert.equal(
      resolveApiBaseUrl({ REACT_APP_API_BASE_URL }),
      REACT_APP_API_BASE_URL,
      `Expected ${REACT_APP_API_BASE_URL} to be preserved`
    );
  }
});

test('resolveApiBaseUrl normalizes uppercase HTTP and HTTPS schemes', () => {
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: 'HTTP://api.example.test/v1///' }),
    'http://api.example.test/v1'
  );
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: 'HTTPS://api.example.test/v1///' }),
    'https://api.example.test/v1'
  );
});

test('resolveApiBaseUrl normalizes default HTTP and HTTPS ports', () => {
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: 'http://api.example.test:80/v1///' }),
    'http://api.example.test/v1'
  );
  assert.equal(
    resolveApiBaseUrl({ REACT_APP_API_BASE_URL: 'https://api.example.test:443/v1///' }),
    'https://api.example.test/v1'
  );
});

test('resolveApiBaseUrl falls back for unsafe configured API base URLs', () => {
  const unsafeConfiguredUrls = [
    'javascript:alert(1)',
    'data:text/plain,hello',
    'ftp://api.example.test',
    '//api.example.test',
    'api.example.test',
    'https://user:pass@api.example.test',
    'https://api.example.test?tenant=admin',
    'https://api.example.test#token',
    'https://api.example.test/a b',
    'https://api.example.test\\evil',
    '/backend?tenant=admin',
    '/backend#token',
    '/backend/%E0%A4%A',
  ];

  for (const REACT_APP_API_BASE_URL of unsafeConfiguredUrls) {
    assert.equal(
      resolveApiBaseUrl({ REACT_APP_API_BASE_URL }),
      'http://localhost:3001',
      `Expected ${REACT_APP_API_BASE_URL} to fall back`
    );
  }
});

test('resolveApiBaseUrl falls back for unsafe printable relative API base path characters', () => {
  const unsafeRelativePaths = [
    '/backend<tenant',
    '/backend>tenant',
    '/backend"tenant',
    "/backend'tenant",
    '/backend{tenant',
    '/backend}tenant',
    '/backend^tenant',
    '/backend`tenant',
    '/backend|tenant',
    '/backend[tenant',
    '/backend]tenant',
  ];

  for (const REACT_APP_API_BASE_URL of unsafeRelativePaths) {
    assert.equal(
      resolveApiBaseUrl({ REACT_APP_API_BASE_URL }),
      'http://localhost:3001',
      `Expected ${JSON.stringify(REACT_APP_API_BASE_URL)} to fall back`
    );
  }
});

test('validateAuthInput requires a trimmed email and password for login', () => {
  assert.deepEqual(
    validateAuthInput({ mode: AUTH_MODES.LOGIN, email: '   ', password: 's3cret' }),
    { ok: false, error: 'Email is required' }
  );
  assert.deepEqual(
    validateAuthInput({ mode: AUTH_MODES.LOGIN, email: 'ada@example.com', password: '' }),
    { ok: false, error: 'Password is required' }
  );
});

test('validateAuthInput rejects emails that do not have exactly one @ with non-empty parts', () => {
  for (const email of ['adaexample.com', 'ada@@example.com', '@example.com', 'ada@']) {
    assert.deepEqual(
      validateAuthInput({ mode: AUTH_MODES.LOGIN, email, password: 's3cret' }),
      { ok: false, error: 'Valid email is required' }
    );
  }
});

test('validateAuthInput rejects embedded unsafe email characters while preserving surrounding trim', () => {
  assert.deepEqual(
    validateAuthInput({ mode: AUTH_MODES.LOGIN, email: ' \tada@example.com\n', password: 's3cret' }),
    {
      ok: true,
      value: {
        mode: AUTH_MODES.LOGIN,
        email: 'ada@example.com',
        password: 's3cret',
      },
    }
  );

  for (const email of [
    'ada @example.com',
    'ada\t@example.com',
    'ada@example.com\nx',
    'ada@example\x00.com',
    'ada@example\u0085.com',
    'ada@example\u007f.com',
    'ada\u200b@example.com',
    'ada\u200e@example.com',
    'ada@example\u202e.com',
  ]) {
    assert.deepEqual(
      validateAuthInput({ mode: AUTH_MODES.LOGIN, email, password: 's3cret' }),
      { ok: false, error: 'Valid email is required' }
    );
  }
});

test('validateAuthInput enforces the backend email length cap and accepts the boundary', () => {
  const maxLengthEmail = createEmailWithLength(AUTH_EMAIL_MAX_LENGTH);
  const tooLongEmail = createEmailWithLength(AUTH_EMAIL_MAX_LENGTH + 1);

  assert.equal(maxLengthEmail.length, AUTH_EMAIL_MAX_LENGTH);
  assert.deepEqual(
    validateAuthInput({ mode: AUTH_MODES.LOGIN, email: `  ${maxLengthEmail}  `, password: 's3cret' }),
    {
      ok: true,
      value: {
        mode: AUTH_MODES.LOGIN,
        email: maxLengthEmail,
        password: 's3cret',
      },
    }
  );
  assert.deepEqual(
    createAuthRequest({ mode: AUTH_MODES.LOGIN, email: tooLongEmail, password: 's3cret' }),
    { ok: false, error: `Email must be ${AUTH_EMAIL_MAX_LENGTH} characters or fewer` }
  );
});

test('createAuthRequest caps register email where it becomes the generated username', () => {
  const maxUsernameEmail = createEmailWithLength(AUTH_USERNAME_MAX_LENGTH);
  const tooLongUsernameEmail = createEmailWithLength(AUTH_USERNAME_MAX_LENGTH + 1);

  assert.equal(maxUsernameEmail.length, AUTH_USERNAME_MAX_LENGTH);
  assert.deepEqual(
    createAuthRequest({
      mode: AUTH_MODES.REGISTER,
      email: maxUsernameEmail,
      password: 'long-password',
      env: LOCAL_ENV,
    }),
    {
      ok: true,
      url: getAuthEndpoint(AUTH_MODES.REGISTER, LOCAL_ENV),
      body: {
        username: maxUsernameEmail,
        email: maxUsernameEmail,
        password: 'long-password',
      },
    }
  );
  assert.deepEqual(
    createAuthRequest({
      mode: AUTH_MODES.REGISTER,
      email: tooLongUsernameEmail,
      password: 'long-password',
      env: LOCAL_ENV,
    }),
    {
      ok: false,
      error: `Email must be ${AUTH_USERNAME_MAX_LENGTH} characters or fewer to create an account`,
    }
  );
});

test('validateAuthInput reports the register email cap before password or login email caps', () => {
  assert.deepEqual(
    validateAuthInput({
      mode: AUTH_MODES.REGISTER,
      email: createEmailWithLength(AUTH_EMAIL_MAX_LENGTH + 1),
      password: 'short',
    }),
    {
      ok: false,
      error: `Email must be ${AUTH_USERNAME_MAX_LENGTH} characters or fewer to create an account`,
    }
  );
});

test('validateAuthInput requires at least 8 password characters for registration', () => {
  assert.deepEqual(
    validateAuthInput({ mode: AUTH_MODES.REGISTER, email: 'ada@example.com', password: '1234567' }),
    { ok: false, error: 'Password must be at least 8 characters' }
  );
  assert.equal(
    validateAuthInput({ mode: AUTH_MODES.REGISTER, email: 'ada@example.com', password: '12345678' }).ok,
    true
  );
});

test('validateAuthInput accepts over-limit login passwords for legacy bcrypt compatibility', () => {
  const legacyPassword = `${'a'.repeat(AUTH_PASSWORD_MAX_BYTES)}🙂`;

  assert.equal(Buffer.byteLength(legacyPassword, 'utf8'), AUTH_PASSWORD_MAX_BYTES + 4);
  assert.deepEqual(
    validateAuthInput({
      mode: AUTH_MODES.LOGIN,
      email: 'ada@example.com',
      password: legacyPassword,
    }),
    {
      ok: true,
      value: {
        mode: AUTH_MODES.LOGIN,
        email: 'ada@example.com',
        password: legacyPassword,
      },
    }
  );
});

test('validateAuthInput enforces the registration bcrypt password byte cap at the boundary', () => {
  const boundaryPassword = 'a'.repeat(AUTH_PASSWORD_MAX_BYTES);
  const tooLongMultibytePassword = `${'a'.repeat(AUTH_PASSWORD_MAX_BYTES - 3)}🙂`;
  const tooLongError = `Password must be ${AUTH_PASSWORD_MAX_BYTES} UTF-8 bytes or fewer`;

  assert.equal(Buffer.byteLength(boundaryPassword, 'utf8'), AUTH_PASSWORD_MAX_BYTES);
  assert.equal(Buffer.byteLength(tooLongMultibytePassword, 'utf8'), AUTH_PASSWORD_MAX_BYTES + 1);
  assert.deepEqual(
    validateAuthInput({
      mode: AUTH_MODES.REGISTER,
      email: 'ada@example.com',
      password: boundaryPassword,
    }),
    {
      ok: true,
      value: {
        mode: AUTH_MODES.REGISTER,
        email: 'ada@example.com',
        password: boundaryPassword,
      },
    }
  );
  assert.deepEqual(
    validateAuthInput({
      mode: AUTH_MODES.REGISTER,
      email: 'ada@example.com',
      password: tooLongMultibytePassword,
    }),
    { ok: false, error: tooLongError }
  );
});

test('createAuthSubmission blocks duplicate in-flight submissions before validation or request creation', () => {
  assert.deepEqual(
    createAuthSubmission({
      mode: AUTH_MODES.REGISTER,
      email: '',
      password: '',
      isSubmitting: true,
    }),
    { ok: false, blocked: true }
  );
});

test('createAuthSubmission returns an explicit invalid shape when validation fails', () => {
  assert.deepEqual(
    createAuthSubmission({
      mode: AUTH_MODES.LOGIN,
      email: '',
      password: 's3cret',
      isSubmitting: false,
      env: LOCAL_ENV,
    }),
    {
      ok: false,
      blocked: false,
      error: 'Email is required',
    }
  );
});

test('createAuthSubmission returns a request when not blocked and input is valid', () => {
  assert.deepEqual(
    createAuthSubmission({
      mode: AUTH_MODES.LOGIN,
      email: 'ada@example.com',
      password: 's3cret',
      isSubmitting: false,
      env: LOCAL_ENV,
    }),
    {
      ok: true,
      blocked: false,
      url: getAuthEndpoint(AUTH_MODES.LOGIN, LOCAL_ENV),
      body: {
        email: 'ada@example.com',
        password: 's3cret',
      },
    }
  );
});

test('parseAuthResponse returns a trimmed token for successful auth responses', () => {
  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.LOGIN,
      ok: true,
      body: { token: '  abc.def.ghi  ' },
    }),
    { ok: true, token: 'abc.def.ghi' }
  );
});

test('parseAuthResponse accepts a max-length token for successful auth responses', () => {
  const token = 'a'.repeat(AUTH_TOKEN_MAX_LENGTH);

  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.LOGIN,
      ok: true,
      body: { token },
    }),
    { ok: true, token }
  );
});

test('parseAuthResponse rejects malformed successful auth payloads', () => {
  for (const body of [
    {},
    { token: '' },
    { token: '   ' },
    { token: 'abc.def ghi' },
    { token: 'abc.def\tghi' },
    { token: 'abc.def\nghi' },
    { token: 'abc.def\rghi' },
    { token: 'abc.def\u0000ghi' },
    { token: 'abc.def\u007fghi' },
    { token: 'a'.repeat(AUTH_TOKEN_MAX_LENGTH + 1) },
    { token: 123 },
    null,
    undefined,
    'not an object',
  ]) {
    assert.deepEqual(
      parseAuthResponse({
        mode: AUTH_MODES.LOGIN,
        ok: true,
        body,
      }),
      { ok: false, error: 'Authentication response was invalid. Please try again.' }
    );
  }
});

test('parseAuthResponse uses generic login copy for every non-2xx login response', () => {
  for (const body of [
    { error: 'Email not found.' },
    { message: 'Password was incorrect.' },
    { error: 'Account exists.', message: 'Password was incorrect.' },
  ]) {
    assert.deepEqual(
      parseAuthResponse({
        mode: AUTH_MODES.LOGIN,
        ok: false,
        body,
      }),
      { ok: false, error: 'Login failed. Please check your credentials.' }
    );
  }
});

test('parseAuthResponse uses bounded backend error copy for non-2xx registration responses', () => {
  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.REGISTER,
      ok: false,
      body: { error: '  Invalid email address.\nPlease try again.  ' },
    }),
    { ok: false, error: 'Invalid email address. Please try again.' }
  );

  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.REGISTER,
      ok: false,
      body: { message: 'Email is already registered.' },
    }),
    { ok: false, error: 'Email is already registered.' }
  );
});

test('parseAuthResponse falls back to mode-specific generic copy for unusable non-2xx payloads', () => {
  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.LOGIN,
      ok: false,
      body: { error: '   ', message: 123 },
    }),
    { ok: false, error: 'Login failed. Please check your credentials.' }
  );

  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.REGISTER,
      ok: false,
      body: { error: 'x'.repeat(241) },
    }),
    {
      ok: false,
      error: 'Could not create account. Please check your email and password.',
    }
  );
});

test('parseAuthResponse handles invalid JSON or body read failures without allowing login', () => {
  const bodyParseError = new SyntaxError('Unexpected end of JSON input');

  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.LOGIN,
      ok: true,
      bodyParseError,
    }),
    { ok: false, error: 'Authentication response was invalid. Please try again.' }
  );

  assert.deepEqual(
    parseAuthResponse({
      mode: AUTH_MODES.LOGIN,
      ok: false,
      bodyParseError,
    }),
    { ok: false, error: 'Login failed. Please check your credentials.' }
  );
});
