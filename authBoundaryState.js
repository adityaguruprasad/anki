const AUTH_LOGOUT_REASONS = Object.freeze({
  MANUAL: 'manual',
  AUTH_EXPIRED: 'authExpired',
});

const AUTH_NOTICE_TYPES = Object.freeze({
  SESSION_EXPIRED: 'sessionExpired',
});

const AUTH_SESSION_EXPIRED_NOTICE_MESSAGE = 'Your session expired. Please log in again.';

function createAuthSessionExpiredNotice() {
  return { type: AUTH_NOTICE_TYPES.SESSION_EXPIRED };
}

function normalizeAuthNotice(notice) {
  if (notice === null || typeof notice !== 'object') {
    return null;
  }

  return notice.type === AUTH_NOTICE_TYPES.SESSION_EXPIRED
    ? createAuthSessionExpiredNotice()
    : null;
}

function getAuthNoticeMessage(notice) {
  const normalizedNotice = normalizeAuthNotice(notice);

  return normalizedNotice ? AUTH_SESSION_EXPIRED_NOTICE_MESSAGE : '';
}

function getAuthNoticeAfterLogout(reason) {
  return reason === AUTH_LOGOUT_REASONS.AUTH_EXPIRED
    ? createAuthSessionExpiredNotice()
    : null;
}

function getAuthNoticeAfterModeToggle() {
  return null;
}

function getAuthNoticeAfterSubmissionStart() {
  return null;
}

module.exports = {
  AUTH_LOGOUT_REASONS,
  AUTH_NOTICE_TYPES,
  AUTH_SESSION_EXPIRED_NOTICE_MESSAGE,
  createAuthSessionExpiredNotice,
  getAuthNoticeAfterLogout,
  getAuthNoticeAfterModeToggle,
  getAuthNoticeAfterSubmissionStart,
  getAuthNoticeMessage,
  normalizeAuthNotice,
};
