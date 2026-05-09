const MAX_CARD_CONTENT_LENGTH = 10000;
const MAX_CARD_CONTENT_LENGTH_LABEL = MAX_CARD_CONTENT_LENGTH.toLocaleString('en-US');

const CARD_CREATE_MESSAGES = Object.freeze({
  missingContent: 'Front and back content are required.',
  frontTooLong: `Front content must be ${MAX_CARD_CONTENT_LENGTH_LABEL} characters or fewer.`,
  backTooLong: `Back content must be ${MAX_CARD_CONTENT_LENGTH_LABEL} characters or fewer.`,
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

module.exports = {
  CARD_CREATE_MESSAGES,
  MAX_CARD_CONTENT_LENGTH,
  createCardSubmission,
};
