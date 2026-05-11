const { parseDeckCardMutationResponsePayload } = require('./deckCardMutationResponse');

const MAX_CARD_CONTENT_LENGTH = 10000;
const MAX_CARD_CONTENT_LENGTH_LABEL = MAX_CARD_CONTENT_LENGTH.toLocaleString('en-US');

const CARD_CREATE_MESSAGES = Object.freeze({
  missingContent: 'Front and back content are required.',
  frontTooLong: `Front content must be ${MAX_CARD_CONTENT_LENGTH_LABEL} characters or fewer.`,
  backTooLong: `Back content must be ${MAX_CARD_CONTENT_LENGTH_LABEL} characters or fewer.`,
  createFailed: 'Unable to add card.',
  networkFailed: 'Network error. Please try again.',
  success: 'Card added.',
});

const CARD_CREATE_COMPLETION_TYPES = Object.freeze({
  IGNORED: 'ignored',
  SERVER_ERROR: 'server-error',
  INVALID_RESPONSE: 'invalid-response',
  NETWORK_ERROR: 'network-error',
  SUCCESS: 'success',
});

function normalizeCardContent(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Callers must return on `blocked` before showing validation errors.
 */
function createCardSubmission({ frontContent, backContent, isSubmitting }) {
  if (isSubmitting) {
    return { ok: false, blocked: true };
  }

  const trimmedFrontContent = normalizeCardContent(frontContent);
  const trimmedBackContent = normalizeCardContent(backContent);

  if (!trimmedFrontContent || !trimmedBackContent) {
    return {
      ok: false,
      blocked: false,
      error: CARD_CREATE_MESSAGES.missingContent,
    };
  }

  if (trimmedFrontContent.length > MAX_CARD_CONTENT_LENGTH) {
    return {
      ok: false,
      blocked: false,
      error: CARD_CREATE_MESSAGES.frontTooLong,
    };
  }

  if (trimmedBackContent.length > MAX_CARD_CONTENT_LENGTH) {
    return {
      ok: false,
      blocked: false,
      error: CARD_CREATE_MESSAGES.backTooLong,
    };
  }

  return {
    ok: true,
    blocked: false,
    frontContent: trimmedFrontContent,
    backContent: trimmedBackContent,
  };
}

function createIgnoredCardCreateCompletion() {
  return {
    type: CARD_CREATE_COMPLETION_TYPES.IGNORED,
    ignored: true,
  };
}

function getCreateCardFailureMessage(payload) {
  return (payload && payload.error) || CARD_CREATE_MESSAGES.createFailed;
}

function getCardCreateResponseCompletion(options = {}) {
  const {
    isCurrent,
    responseOk,
    payload,
    parseCreatedCard = parseDeckCardMutationResponsePayload,
  } = options;

  if (!isCurrent) {
    return createIgnoredCardCreateCompletion();
  }

  if (!responseOk) {
    return {
      type: CARD_CREATE_COMPLETION_TYPES.SERVER_ERROR,
      ignored: false,
      error: getCreateCardFailureMessage(payload),
    };
  }

  try {
    return {
      type: CARD_CREATE_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      createdCard: parseCreatedCard(payload),
      success: CARD_CREATE_MESSAGES.success,
    };
  } catch {
    return {
      type: CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE,
      ignored: false,
      error: CARD_CREATE_MESSAGES.createFailed,
    };
  }
}

function getCardCreateNetworkFailureCompletion(options = {}) {
  if (!options.isCurrent) {
    return createIgnoredCardCreateCompletion();
  }

  return {
    type: CARD_CREATE_COMPLETION_TYPES.NETWORK_ERROR,
    ignored: false,
    error: CARD_CREATE_MESSAGES.networkFailed,
  };
}

function shouldRunCardCreateFinallyCleanup(options = {}) {
  return Boolean(options.isCurrent);
}

module.exports = {
  CARD_CREATE_COMPLETION_TYPES,
  CARD_CREATE_MESSAGES,
  MAX_CARD_CONTENT_LENGTH,
  createCardSubmission,
  getCardCreateNetworkFailureCompletion,
  getCardCreateResponseCompletion,
  getCreateCardFailureMessage,
  shouldRunCardCreateFinallyCleanup,
};
