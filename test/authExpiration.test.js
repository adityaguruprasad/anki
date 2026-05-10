const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AUTH_EXPIRED_HTTP_STATUSES,
  handleAuthExpiredResponse,
  isAuthExpiredResponse,
} = require('../authExpiration');

test('isAuthExpiredResponse recognizes protected auth failure statuses', () => {
  assert.deepEqual(AUTH_EXPIRED_HTTP_STATUSES, [401, 403]);

  assert.equal(isAuthExpiredResponse({ status: 401 }), true);
  assert.equal(isAuthExpiredResponse({ status: 403 }), true);
});

test('isAuthExpiredResponse ignores missing, malformed, and non-auth statuses', () => {
  assert.equal(isAuthExpiredResponse(null), false);
  assert.equal(isAuthExpiredResponse(undefined), false);
  assert.equal(isAuthExpiredResponse({}), false);
  assert.equal(isAuthExpiredResponse({ status: '401' }), false);
  assert.equal(isAuthExpiredResponse({ status: 0 }), false);
  assert.equal(isAuthExpiredResponse({ status: 200 }), false);
  assert.equal(isAuthExpiredResponse({ status: 400 }), false);
  assert.equal(isAuthExpiredResponse({ status: 404 }), false);
  assert.equal(isAuthExpiredResponse({ status: 500 }), false);
});

test('isAuthExpiredResponse treats unsafe status access as non-auth', () => {
  const response = {};
  Object.defineProperty(response, 'status', {
    get() {
      throw new Error('status unavailable');
    },
  });

  assert.equal(isAuthExpiredResponse(response), false);
});

test('handleAuthExpiredResponse invokes an optional callback for auth failures', () => {
  const response = { status: 401 };
  const calls = [];

  const handled = handleAuthExpiredResponse(response, (expiredResponse) => {
    calls.push(expiredResponse);
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, [response]);
});

test('handleAuthExpiredResponse is safe without a usable callback', () => {
  assert.equal(handleAuthExpiredResponse({ status: 403 }), true);
  assert.equal(handleAuthExpiredResponse({ status: 403 }, 'not a function'), true);

  assert.doesNotThrow(() => {
    assert.equal(handleAuthExpiredResponse({ status: 403 }, () => {
      throw new Error('logout failed');
    }), true);
  });
});

test('handleAuthExpiredResponse leaves non-auth responses untouched', () => {
  let callbackWasCalled = false;

  const handled = handleAuthExpiredResponse({ status: 500 }, () => {
    callbackWasCalled = true;
  });

  assert.equal(handled, false);
  assert.equal(callbackWasCalled, false);
});
