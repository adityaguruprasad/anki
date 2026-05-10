const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTH_LOGOUT_REASONS,
  AUTH_NOTICE_TYPES,
  AUTH_SESSION_EXPIRED_NOTICE_MESSAGE,
  getAuthNoticeAfterLogout,
  getAuthNoticeAfterModeToggle,
  getAuthNoticeAfterSubmissionStart,
  getAuthNoticeMessage,
  normalizeAuthNotice,
} = require('../authBoundaryState');

test('auth-expired logout creates the login-boundary session notice', () => {
  assert.deepEqual(
    getAuthNoticeAfterLogout(AUTH_LOGOUT_REASONS.AUTH_EXPIRED),
    { type: AUTH_NOTICE_TYPES.SESSION_EXPIRED }
  );
  assert.equal(
    getAuthNoticeMessage(getAuthNoticeAfterLogout(AUTH_LOGOUT_REASONS.AUTH_EXPIRED)),
    AUTH_SESSION_EXPIRED_NOTICE_MESSAGE
  );
});

test('manual logout and unknown logout reasons do not create expiration notices', () => {
  assert.equal(getAuthNoticeAfterLogout(AUTH_LOGOUT_REASONS.MANUAL), null);
  assert.equal(getAuthNoticeAfterLogout('unknown'), null);
  assert.equal(getAuthNoticeAfterLogout(), null);
});

test('notice rendering uses fixed non-secret copy for recognized notice types', () => {
  assert.equal(
    getAuthNoticeMessage({
      type: AUTH_NOTICE_TYPES.SESSION_EXPIRED,
      message: 'token abc.def.ghi expired for user@example.com',
    }),
    AUTH_SESSION_EXPIRED_NOTICE_MESSAGE
  );
  assert.equal(getAuthNoticeMessage({ type: 'other', message: 'secret detail' }), '');
  assert.equal(getAuthNoticeMessage(null), '');
});

test('login/register mode toggle clears the auth-boundary notice', () => {
  assert.equal(getAuthNoticeAfterModeToggle(), null);
});

test('valid submission start clears the auth-boundary notice', () => {
  assert.equal(getAuthNoticeAfterSubmissionStart(), null);
});

test('normalizeAuthNotice only preserves supported auth notice state', () => {
  assert.deepEqual(
    normalizeAuthNotice({ type: AUTH_NOTICE_TYPES.SESSION_EXPIRED, message: 'ignored' }),
    { type: AUTH_NOTICE_TYPES.SESSION_EXPIRED }
  );
  assert.equal(normalizeAuthNotice({ type: 'unsupported' }), null);
  assert.equal(normalizeAuthNotice('sessionExpired'), null);
});
