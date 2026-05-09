const MAX_DECK_NAME_LENGTH = 120;

const DECK_NAME_VALIDATION_ERROR_CODES = Object.freeze({
  NON_STRING: 'deck_name_non_string',
  BLANK: 'deck_name_blank',
  TOO_LONG: 'deck_name_too_long',
});

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
