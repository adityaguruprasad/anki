const { hasDeckCardMutationPayload } = require('./deckCardMutationResponse');

const MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR = 'Malformed deck-card removal payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasDeckCardRemovalSuccessPayload(payload, options = {}) {
  return (
    isObjectRecord(payload)
    && payload.success === true
    // Delete echoes intentionally use a smaller card contract than create/update
    // responses because scheduling metadata is irrelevant after removal.
    && hasDeckCardMutationPayload(payload.card, {
      ...options,
      requireSchedulingMetadata: false,
    })
  );
}

function parseDeckCardRemovalSuccessPayload(payload, options = {}) {
  if (!hasDeckCardRemovalSuccessPayload(payload, options)) {
    throw new Error(MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
};
