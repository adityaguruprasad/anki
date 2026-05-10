const MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR = 'Malformed deck-card mutation payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableCardId(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return isNonBlankString(value);
}

function hasDeckCardMutationPayload(payload) {
  return (
    isObjectRecord(payload)
    && hasUsableCardId(payload.id)
    && typeof payload.front_content === 'string'
    && typeof payload.back_content === 'string'
  );
}

function parseDeckCardMutationResponsePayload(payload) {
  if (!hasDeckCardMutationPayload(payload)) {
    throw new Error(MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR,
  hasDeckCardMutationPayload,
  parseDeckCardMutationResponsePayload,
};
