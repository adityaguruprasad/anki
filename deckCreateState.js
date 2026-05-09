const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
} = require('./deckNameValidation');

const CREATE_DECK_MESSAGES = Object.freeze({
  blankName: 'Deck name is required.',
  createFailed: 'Unable to create deck.',
  networkFailed: 'Network error. Please try again.',
  tooLongName: `Deck name must be ${MAX_DECK_NAME_LENGTH} characters or fewer.`,
  success: 'Deck created.',
});

function validateCreateDeckName(name) {
  const validation = validateDeckName(name);

  if (!validation.ok) {
    if (validation.code === DECK_NAME_VALIDATION_ERROR_CODES.BLANK) {
      return { ok: false, code: validation.code, error: CREATE_DECK_MESSAGES.blankName };
    }

    if (validation.code === DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG) {
      return { ok: false, code: validation.code, error: CREATE_DECK_MESSAGES.tooLongName };
    }
  }

  return validation;
}

function createDeckSubmission({ name, isSubmitting }) {
  if (isSubmitting) {
    return { ok: false, blocked: true };
  }

  const validation = validateCreateDeckName(name);
  if (!validation.ok) {
    return {
      ok: false,
      blocked: false,
      error: validation.error,
    };
  }

  return {
    ok: true,
    blocked: false,
    name: validation.value,
  };
}

function getCreateDeckFailureMessage(payload) {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return CREATE_DECK_MESSAGES.createFailed;
}

module.exports = {
  CREATE_DECK_MESSAGES,
  createDeckSubmission,
  getCreateDeckFailureMessage,
  validateCreateDeckName,
};
