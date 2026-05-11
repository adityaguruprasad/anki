const MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR = 'Malformed deck removal payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasDeckRemovalSuccessPayload(payload) {
  return isObjectRecord(payload) && payload.success === true;
}

function parseDeckRemovalSuccessPayload(payload) {
  if (!hasDeckRemovalSuccessPayload(payload)) {
    throw new Error(MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR,
  hasDeckRemovalSuccessPayload,
  parseDeckRemovalSuccessPayload,
};
