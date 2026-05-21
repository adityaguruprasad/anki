const MAX_CARD_CONTENT_LENGTH = 10000;
// Keep this blocklist in sync with the SQL schema/migration pattern. It targets
// invisible bidi/isolate controls, zero-width space, word joiner, and BOM-style
// controls that can make card text misleading, while intentionally allowing
// ZWNJ/ZWJ because they can be legitimate in human-authored study text.
const UNSAFE_CARD_CONTENT_FORMATTING_CHARACTER_PATTERN =
  /[\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;

function validateCardContent(value, fieldName = 'cardContent') {
  if (typeof value !== 'string') {
    return { ok: false, error: `Invalid ${fieldName}: must be a non-empty string` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `Invalid ${fieldName}: must be a non-empty string` };
  }

  if (value.includes('\u0000')) {
    return { ok: false, error: `Invalid ${fieldName}: cannot contain null bytes` };
  }

  if (UNSAFE_CARD_CONTENT_FORMATTING_CHARACTER_PATTERN.test(value)) {
    return { ok: false, error: `Invalid ${fieldName}: cannot contain invisible formatting characters` };
  }

  if (trimmed.length > MAX_CARD_CONTENT_LENGTH) {
    return { ok: false, error: `Invalid ${fieldName}: must be ${MAX_CARD_CONTENT_LENGTH} characters or fewer` };
  }

  return { ok: true, value: trimmed };
}

function isValidCardContent(value) {
  return validateCardContent(value).ok;
}

module.exports = {
  MAX_CARD_CONTENT_LENGTH,
  UNSAFE_CARD_CONTENT_FORMATTING_CHARACTER_PATTERN,
  isValidCardContent,
  validateCardContent,
};
