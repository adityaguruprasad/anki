const { hasDeckCardMutationPayload } = require('./deckCardMutationResponse');

const MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR = 'Malformed deck-card removal payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasDeckCardRemovalSuccessPayload(payload) {
  return (
    isObjectRecord(payload)
    && payload.success === true
    && hasDeckCardMutationPayload(payload.card)
  );
}

function parseDeckCardRemovalSuccessPayload(payload) {
  if (!hasDeckCardRemovalSuccessPayload(payload)) {
    throw new Error(MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
};
