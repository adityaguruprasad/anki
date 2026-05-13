const MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR = 'Malformed deck-card mutation payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableCardId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0;
  }

  return isNonBlankString(value);
}

function hasSameCardId(leftId, rightId) {
  return String(leftId) === String(rightId);
}

function hasDeckCardMutationPayload(payload, options = {}) {
  const { expectedId } = options;
  const hasExpectedId = expectedId !== undefined;

  return (
    isObjectRecord(payload)
    && hasUsableCardId(payload.id)
    && typeof payload.front_content === 'string'
    && typeof payload.back_content === 'string'
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
