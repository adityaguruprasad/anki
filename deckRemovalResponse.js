const MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR = 'Malformed deck removal payload';

const DECK_REMOVAL_MESSAGES = Object.freeze({
  deleteFailed: 'Unable to delete deck.',
  networkFailed: 'Network error. Please try again.',
});

const DECK_REMOVAL_COMPLETION_TYPES = Object.freeze({
  IGNORED: 'ignored',
  SERVER_ERROR: 'server-error',
  INVALID_RESPONSE: 'invalid-response',
  SUCCESS: 'success',
});

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasDeckRemovalSuccessPayload(payload) {
  return isObjectRecord(payload) && payload.success === true;
}

function parseDeckRemovalSuccessPayload(payload) {
  if (!hasDeckRemovalSuccessPayload(payload)) {
    throw new Error(MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR);
  }

  return payload;
}

function getDeckRemovalFailureMessage(payload) {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return DECK_REMOVAL_MESSAGES.deleteFailed;
}

function createIgnoredDeckRemovalCompletion() {
  return {
    type: DECK_REMOVAL_COMPLETION_TYPES.IGNORED,
    ignored: true,
  };
}

function getDeckRemovalResponseCompletion(options = {}) {
  const {
    isCurrent,
    responseOk,
    payload,
    parseRemovalSuccess = parseDeckRemovalSuccessPayload,
  } = options;

  if (!isCurrent) {
    return createIgnoredDeckRemovalCompletion();
  }

  if (!responseOk) {
    return {
      type: DECK_REMOVAL_COMPLETION_TYPES.SERVER_ERROR,
      ignored: false,
      error: getDeckRemovalFailureMessage(payload),
    };
  }

  try {
    return {
      type: DECK_REMOVAL_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      removal: parseRemovalSuccess(payload),
    };
  } catch {
    return {
      type: DECK_REMOVAL_COMPLETION_TYPES.INVALID_RESPONSE,
      ignored: false,
      error: DECK_REMOVAL_MESSAGES.deleteFailed,
    };
  }
}

module.exports = {
  DECK_REMOVAL_COMPLETION_TYPES,
  DECK_REMOVAL_MESSAGES,
  MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR,
  getDeckRemovalFailureMessage,
  getDeckRemovalResponseCompletion,
  hasDeckRemovalSuccessPayload,
  parseDeckRemovalSuccessPayload,
};
