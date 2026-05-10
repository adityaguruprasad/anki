const MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR = 'Malformed deck-management deck-list payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableDeckManagementDeckId(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return isNonBlankString(value);
}

function hasDeckManagementDeckRowPayload(deck) {
  return (
    isObjectRecord(deck)
    && hasUsableDeckManagementDeckId(deck.id)
    && isNonBlankString(deck.name)
  );
}

function hasDeckManagementDeckListPayload(payload) {
  return Array.isArray(payload) && payload.every(hasDeckManagementDeckRowPayload);
}

function parseDeckManagementDeckListPayload(payload) {
  if (!hasDeckManagementDeckListPayload(payload)) {
    throw new Error(MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR,
  hasDeckManagementDeckListPayload,
  parseDeckManagementDeckListPayload,
};
