const MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR = 'Malformed deck-card mutation payload';
const {
  hasRouteSafeCardId,
  hasSameRouteSafeCardId,
} = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasUsableCardId(value) {
  return hasRouteSafeCardId(value);
}

function hasSameCardId(leftId, rightId) {
  return hasSameRouteSafeCardId(leftId, rightId);
}

function isNonBlankCardContent(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasValidMutationNextReview(card) {
  if (!Object.prototype.hasOwnProperty.call(card, 'next_review')) {
    return false;
  }

  return card.next_review === null || isValidIsoTimestamp(card.next_review);
}

function hasDeckCardMutationPayload(payload, options = {}) {
  const { expectedId } = options;
  const hasExpectedId = expectedId !== undefined;

  return (
    isObjectRecord(payload)
    && hasUsableCardId(payload.id)
    && isNonBlankCardContent(payload.front_content)
    && isNonBlankCardContent(payload.back_content)
    && hasValidMutationNextReview(payload)
    && (!hasExpectedId || (hasUsableCardId(expectedId) && hasSameCardId(payload.id, expectedId)))
  );
}

function parseDeckCardMutationResponsePayload(payload, options = {}) {
  if (!hasDeckCardMutationPayload(payload, options)) {
    throw new Error(MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR,
  hasDeckCardMutationPayload,
  parseDeckCardMutationResponsePayload,
};
