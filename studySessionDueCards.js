const { isValidCardContent } = require('./cardContentValidation');
const { hasRouteSafeCardId, normalizeRouteSafeId } = require('./cardIdentifier');
const {
  getOwnArrayDataPropertyValue,
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

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
  if (!isObjectRecord(card)) {
    return false;
  }

  // Only own data expectedDeckId values anchor; omitted/undefined preserves legacy unanchored callers.
  const expectedDeckId = getOwnDataPropertyValue(options, 'expectedDeckId');
  const hasExpectedDeckId = expectedDeckId !== undefined;
  const id = getOwnDataPropertyValue(card, 'id');
  const deckId = getOwnDataPropertyValue(card, 'deck_id');
  const frontContent = getOwnDataPropertyValue(card, 'front_content');
  const backContent = getOwnDataPropertyValue(card, 'back_content');

  return (
    hasSafeStudySessionCardId(id)
    && isValidCardContent(frontContent)
    && isValidCardContent(backContent)
    && (!hasExpectedDeckId || hasMatchingExpectedDeckId(deckId, expectedDeckId))
  );
}

function selectValidatedStudySessionDueCard(payload, options = {}) {
  // This client requests due cards with limit=1; multiple rows mean the response contract is malformed.
  if (!Array.isArray(payload) || payload.length > 1) {
    throw new Error(MALFORMED_DUE_CARD_PAYLOAD_ERROR);
  }

  if (payload.length === 0) {
    return null;
  }

  const card = getOwnArrayDataPropertyValue(payload, 0);
  if (!hasStudySessionDueCardRowPayload(card, options)) {
    throw new Error(MALFORMED_DUE_CARD_PAYLOAD_ERROR);
  }

  return card;
}

module.exports = {
  MALFORMED_DUE_CARD_PAYLOAD_ERROR,
  hasSafeStudySessionCardId,
  hasStudySessionDueCardRowPayload,
  selectValidatedStudySessionDueCard,
};
