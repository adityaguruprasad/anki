const { MAX_CARD_CONTENT_LENGTH, validateCardContent } = require('./cardContentValidation');
const { parseDeckCardMutationResponsePayload } = require('./deckCardMutationResponse');
const { getOwnDataPropertyValue } = require('./recordDataProperty');

const MAX_CARD_CONTENT_LENGTH_LABEL = MAX_CARD_CONTENT_LENGTH.toLocaleString('en-US');

const CARD_CREATE_MESSAGES = Object.freeze({
  missingContent: 'Front and back content are required.',
  frontTooLong: `Front content must be ${MAX_CARD_CONTENT_LENGTH_LABEL} characters or fewer.`,
  backTooLong: `Back content must be ${MAX_CARD_CONTENT_LENGTH_LABEL} characters or fewer.`,
  frontUnsafe: 'Front content cannot contain null bytes or invisible formatting characters.',
  backUnsafe: 'Back content cannot contain null bytes or invisible formatting characters.',
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

function validateCardSubmissionContent({ frontContent, backContent } = {}) {
  const trimmedFrontContent = normalizeCardContent(frontContent);
  const trimmedBackContent = normalizeCardContent(backContent);

  if (!trimmedFrontContent || !trimmedBackContent) {
    return {
      ok: false,
      error: CARD_CREATE_MESSAGES.missingContent,
    };
  }

  if (trimmedFrontContent.length > MAX_CARD_CONTENT_LENGTH) {
    return {
      ok: false,
      error: CARD_CREATE_MESSAGES.frontTooLong,
    };
  }

  if (trimmedBackContent.length > MAX_CARD_CONTENT_LENGTH) {
    return {
      ok: false,
      error: CARD_CREATE_MESSAGES.backTooLong,
    };
  }

  if (!validateCardContent(trimmedFrontContent, 'frontContent').ok) {
    return {
      ok: false,
      error: CARD_CREATE_MESSAGES.frontUnsafe,
    };
  }

  if (!validateCardContent(trimmedBackContent, 'backContent').ok) {
    return {
      ok: false,
      error: CARD_CREATE_MESSAGES.backUnsafe,
    };
  }

  return {
    ok: true,
    frontContent: trimmedFrontContent,
    backContent: trimmedBackContent,
  };
}

/**
 * Callers must return on `blocked` before showing validation errors.
 */
function createCardSubmission({ frontContent, backContent, isSubmitting }) {
  if (isSubmitting) {
    return { ok: false, blocked: true };
  }

  const validation = validateCardSubmissionContent({ frontContent, backContent });
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
    frontContent: validation.frontContent,
    backContent: validation.backContent,
  };
}

function createIgnoredCardCreateCompletion() {
  return {
    type: CARD_CREATE_COMPLETION_TYPES.IGNORED,
    ignored: true,
  };
}

function getCreateCardFailureMessage(payload) {
  const serverError = getOwnDataPropertyValue(payload, 'error');

  if (typeof serverError === 'string') {
    const error = serverError.trim();
    if (error) {
      return error;
    }
  }

  return CARD_CREATE_MESSAGES.createFailed;
}

function getCardCreateResponseCompletion(options = {}) {
  const {
    expectedDeckId,
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
    const createdCard = expectedDeckId === undefined
      ? parseCreatedCard(payload)
      : parseCreatedCard(payload, { expectedDeckId });

    return {
      type: CARD_CREATE_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      createdCard,
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
  validateCardSubmissionContent,
};
