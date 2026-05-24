const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
} = require('./deckNameValidation');
const { parseDeckMutationResponsePayload } = require('./deckMutationResponse');
const { getOwnDataPropertyValue } = require('./recordDataProperty');

const RENAME_DECK_MESSAGES = Object.freeze({
  blankName: 'Deck name is required.',
  invalidName: 'Enter a valid deck name.',
  networkFailed: 'Network error. Please try again.',
  renameFailed: 'Unable to rename deck.',
  tooLongName: `Deck name must be ${MAX_DECK_NAME_LENGTH} characters or fewer.`,
});

const RENAME_DECK_COMPLETION_TYPES = Object.freeze({
  IGNORED: 'ignored',
  SERVER_ERROR: 'server-error',
  INVALID_RESPONSE: 'invalid-response',
  SUCCESS: 'success',
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
  const serverError = getOwnDataPropertyValue(payload, 'error');

  if (typeof serverError === 'string' && serverError.trim()) {
    return serverError;
  }

  return RENAME_DECK_MESSAGES.renameFailed;
}

function createIgnoredRenameDeckCompletion() {
  return {
    type: RENAME_DECK_COMPLETION_TYPES.IGNORED,
    ignored: true,
  };
}

function getRenameDeckResponseCompletion(options = {}) {
  const {
    deckId,
    isCurrent,
    responseOk,
    payload,
    parseRenamedDeck = parseDeckMutationResponsePayload,
  } = options;

  if (!isCurrent) {
    return createIgnoredRenameDeckCompletion();
  }

  if (!responseOk) {
    return {
      type: RENAME_DECK_COMPLETION_TYPES.SERVER_ERROR,
      ignored: false,
      error: getRenameDeckFailureMessage(payload),
    };
  }

  try {
    return {
      type: RENAME_DECK_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      renamedDeck: parseRenamedDeck(payload, { expectedId: deckId }),
    };
  } catch {
    return {
      type: RENAME_DECK_COMPLETION_TYPES.INVALID_RESPONSE,
      ignored: false,
      error: RENAME_DECK_MESSAGES.renameFailed,
    };
  }
}

module.exports = {
  RENAME_DECK_COMPLETION_TYPES,
  RENAME_DECK_MESSAGES,
  getRenameDeckFailureMessage,
  getRenameDeckResponseCompletion,
  renameDeckSubmission,
  validateRenameDeckName,
};
