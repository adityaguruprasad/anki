const { hasDeckCardMutationPayload } = require('./deckCardMutationResponse');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

const MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR = 'Malformed deck-card removal payload';

function hasDeckCardRemovalSuccessPayload(payload, options = {}) {
  if (!isObjectRecord(payload)) {
    return false;
  }

  const success = getOwnDataPropertyValue(payload, 'success');
  const card = getOwnDataPropertyValue(payload, 'card');

  return (
    success === true
    // Delete echoes intentionally use a smaller card contract than create/update
    // responses because scheduling metadata is irrelevant after removal.
    && hasDeckCardMutationPayload(card, {
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
