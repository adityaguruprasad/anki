const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTH_MODES,
  createAuthRequest,
  createAuthSubmission,
  getAuthEndpoint,
  getNextAuthMode,
  parseAuthResponse,
  resolveApiBaseUrl,
  validateAuthInput,
} = require('../authFormState');

const LOCAL_ENV = Object.freeze({});

test('getNextAuthMode toggles between login and register modes', () => {
  assert.equal(getNextAuthMode(AUTH_MODES.LOGIN), AUTH_MODES.REGISTER);
  assert.equal(getNextAuthMode(AUTH_MODES.REGISTER), AUTH_MODES.LOGIN);
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

test('parseAuthResponse rejects malformed successful auth payloads', () => {
  for (const body of [
    {},
    { token: '' },
    { token: '   ' },
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
