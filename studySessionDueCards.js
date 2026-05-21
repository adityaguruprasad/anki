const { isValidCardContent } = require('./cardContentValidation');
const { hasRouteSafeCardId, normalizeRouteSafeId } = require('./cardIdentifier');

const MALFORMED_DUE_CARD_PAYLOAD_ERROR = 'Malformed due-card payload';

function hasSafeStudySessionCardId(value) {
  return hasRouteSafeCardId(value);
}

function hasMatchingExpectedDeckId(deckId, expectedDeckId) {
  const normalizedDeckId = normalizeRouteSafeId(deckId);
  const normalizedExpectedDeckId = normalizeRouteSafeId(expectedDeckId);

  return normalizedDeckId !== null && normalizedDeckId === normalizedExpectedDeckId;
}

function hasStudySessionDueCardRowPayload(card, options = {}) {
  const { expectedDeckId } = options;
  // Only omitted/undefined preserves legacy unanchored callers; null or invalid values opt into validation and fail.
  const hasExpectedDeckId = expectedDeckId !== undefined;

  return (
    card !== null
    && typeof card === 'object'
    && !Array.isArray(card)
    && hasSafeStudySessionCardId(card.id)
    && isValidCardContent(card.front_content)
    && isValidCardContent(card.back_content)
    && (!hasExpectedDeckId || hasMatchingExpectedDeckId(card.deck_id, expectedDeckId))
  );
}

function selectValidatedStudySessionDueCard(payload, options = {}) {
  // This client requests due cards with limit=1; multiple rows mean the response contract is malformed.
  if (!Array.isArray(payload) || payload.length > 1) {
    throw new Error(MALFORMED_DUE_CARD_PAYLOAD_ERROR);
  }

  for (const card of payload) {
    if (!hasStudySessionDueCardRowPayload(card, options)) {
      throw new Error(MALFORMED_DUE_CARD_PAYLOAD_ERROR);
    }
  }

  return payload.length > 0 ? payload[0] : null;
}

module.exports = {
  MALFORMED_DUE_CARD_PAYLOAD_ERROR,
  hasSafeStudySessionCardId,
  hasStudySessionDueCardRowPayload,
  selectValidatedStudySessionDueCard,
};
