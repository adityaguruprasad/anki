const AUTH_PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 input bytes; reject new passwords instead of silently truncating.
const AUTH_PASSWORD_MAX_BYTES = 72;
const PASSWORD_REQUIRED_ERROR = 'Password is required';
const PASSWORD_TOO_SHORT_ERROR = `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters`;
const PASSWORD_TOO_LONG_ERROR = `Password must be ${AUTH_PASSWORD_MAX_BYTES} UTF-8 bytes or fewer`;

function getUtf8ByteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function isPasswordTooLongForBcrypt(password) {
  return getUtf8ByteLength(password) > AUTH_PASSWORD_MAX_BYTES;
}

function validateLoginPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: PASSWORD_REQUIRED_ERROR };
  }

  return { ok: true, value: password };
}

function validateRegistrationPassword(password) {
  if (typeof password !== 'string' || password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return { ok: false, error: PASSWORD_TOO_SHORT_ERROR };
  }

  if (isPasswordTooLongForBcrypt(password)) {
    return { ok: false, error: PASSWORD_TOO_LONG_ERROR };
  }

  return { ok: true, value: password };
}

module.exports = {
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRED_ERROR,
  PASSWORD_TOO_LONG_ERROR,
  PASSWORD_TOO_SHORT_ERROR,
  getUtf8ByteLength,
  validateLoginPassword,
  validateRegistrationPassword,
};
