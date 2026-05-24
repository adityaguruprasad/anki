const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
} = require('./deckNameValidation');
const { parseDeckMutationResponsePayload } = require('./deckMutationResponse');
const { getOwnDataPropertyValue } = require('./recordDataProperty');

const CREATE_DECK_MESSAGES = Object.freeze({
  blankName: 'Deck name is required.',
  createFailed: 'Unable to create deck.',
  networkFailed: 'Network error. Please try again.',
  tooLongName: `Deck name must be ${MAX_DECK_NAME_LENGTH} characters or fewer.`,
  success: 'Deck created.',
});

const CREATE_DECK_COMPLETION_TYPES = Object.freeze({
  IGNORED: 'ignored',
  SERVER_ERROR: 'server-error',
  INVALID_RESPONSE: 'invalid-response',
  SUCCESS: 'success',
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
  const serverError = getOwnDataPropertyValue(payload, 'error');

  if (typeof serverError === 'string' && serverError.trim()) {
    return serverError;
  }

  return CREATE_DECK_MESSAGES.createFailed;
}

function createIgnoredCreateDeckCompletion() {
  return {
    type: CREATE_DECK_COMPLETION_TYPES.IGNORED,
    ignored: true,
  };
}

function getCreateDeckResponseCompletion(options = {}) {
  const {
    isCurrent,
    responseOk,
    payload,
    parseCreatedDeck = parseDeckMutationResponsePayload,
  } = options;

  if (!isCurrent) {
    return createIgnoredCreateDeckCompletion();
  }

  if (!responseOk) {
    return {
      type: CREATE_DECK_COMPLETION_TYPES.SERVER_ERROR,
      ignored: false,
      error: getCreateDeckFailureMessage(payload),
    };
  }

  try {
    return {
      type: CREATE_DECK_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      createdDeck: parseCreatedDeck(payload),
      success: CREATE_DECK_MESSAGES.success,
    };
  } catch {
    return {
      type: CREATE_DECK_COMPLETION_TYPES.INVALID_RESPONSE,
      ignored: false,
      error: CREATE_DECK_MESSAGES.createFailed,
    };
  }
}

module.exports = {
  CREATE_DECK_COMPLETION_TYPES,
  CREATE_DECK_MESSAGES,
  createDeckSubmission,
  getCreateDeckResponseCompletion,
  getCreateDeckFailureMessage,
  validateCreateDeckName,
};
