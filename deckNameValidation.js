// Keep aligned with anki.db decks.name VARCHAR(100).
const MAX_DECK_NAME_LENGTH = 100;

const DECK_NAME_VALIDATION_ERROR_CODES = Object.freeze({
  NON_STRING: 'deck_name_non_string',
  BLANK: 'deck_name_blank',
  UNSAFE_CHARACTERS: 'deck_name_unsafe_characters',
  TOO_LONG: 'deck_name_too_long',
});
const UNSAFE_DECK_NAME_CHARACTER_PATTERN =
  /[\x00-\x1F\x7F-\x9F\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

function validateDeckName(name) {
  if (typeof name !== 'string') {
    return {
      ok: false,
      code: DECK_NAME_VALIDATION_ERROR_CODES.NON_STRING,
      error: 'Invalid deck name: must be a string',
    };
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return {
      ok: false,
      code: DECK_NAME_VALIDATION_ERROR_CODES.BLANK,
      error: 'Invalid deck name: cannot be blank',
    };
  }

  if (UNSAFE_DECK_NAME_CHARACTER_PATTERN.test(trimmedName)) {
    return {
      ok: false,
      code: DECK_NAME_VALIDATION_ERROR_CODES.UNSAFE_CHARACTERS,
      error: 'Invalid deck name: cannot contain line breaks, control characters, or invisible formatting characters',
    };
  }

  if (trimmedName.length > MAX_DECK_NAME_LENGTH) {
    return {
      ok: false,
      code: DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG,
      error: `Invalid deck name: must be at most ${MAX_DECK_NAME_LENGTH} characters`,
    };
  }

  return { ok: true, value: trimmedName };
}

module.exports = {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
};
