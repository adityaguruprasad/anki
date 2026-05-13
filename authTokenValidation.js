const AUTH_TOKEN_MAX_LENGTH = 4096;
// Trim allows harmless surrounding whitespace; this still rejects embedded
// whitespace plus C0/DEL control characters after trimming.
const AUTH_TOKEN_UNSAFE_CHARACTER_PATTERN = /[\s\x00-\x1F\x7F]/u;

function normalizeAuthToken(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const token = value.trim();
  if (
    token.length === 0
    || token.length > AUTH_TOKEN_MAX_LENGTH
    || AUTH_TOKEN_UNSAFE_CHARACTER_PATTERN.test(token)
  ) {
    return null;
  }

  return token;
}

module.exports = {
  AUTH_TOKEN_MAX_LENGTH,
  normalizeAuthToken,
};
