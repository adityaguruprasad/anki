const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
} = require('./deckNameValidation');

const RENAME_DECK_MESSAGES = Object.freeze({
  blankName: 'Deck name is required.',
  invalidName: 'Enter a valid deck name.',
  networkFailed: 'Network error. Please try again.',
  renameFailed: 'Unable to rename deck.',
  tooLongName: `Deck name must be ${MAX_DECK_NAME_LENGTH} characters or fewer.`,
});

function validateRenameDeckName(name) {
  const validation = validateDeckName(name);

  if (!validation.ok) {
    if (validation.code === DECK_NAME_VALIDATION_ERROR_CODES.BLANK) {
      return { ok: false, code: validation.code, error: RENAME_DECK_MESSAGES.blankName };
    }

    if (validation.code === DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG) {
      return { ok: false, code: validation.code, error: RENAME_DECK_MESSAGES.tooLongName };
    }

    return { ok: false, code: validation.code, error: RENAME_DECK_MESSAGES.invalidName };
  }

  return validation;
}

function renameDeckSubmission({ name, currentName, isSubmitting }) {
  if (isSubmitting) {
    return { ok: false, blocked: true };
  }

  const validation = validateRenameDeckName(name);
  if (!validation.ok) {
    return {
      ok: false,
      blocked: false,
      error: validation.error,
    };
  }

  if (typeof currentName === 'string' && validation.value === currentName.trim()) {
    return {
      ok: false,
      blocked: false,
      unchanged: true,
    };
  }

  return {
    ok: true,
    blocked: false,
    name: validation.value,
  };
}

function getRenameDeckFailureMessage(payload) {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return RENAME_DECK_MESSAGES.renameFailed;
}

module.exports = {
  RENAME_DECK_MESSAGES,
  getRenameDeckFailureMessage,
  renameDeckSubmission,
  validateRenameDeckName,
};
