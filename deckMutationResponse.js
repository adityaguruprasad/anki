const MALFORMED_DECK_MUTATION_PAYLOAD_ERROR = 'Malformed deck mutation payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableDeckId(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return isNonBlankString(value);
}

function hasSameDeckId(leftId, rightId) {
  return String(leftId) === String(rightId);
}

function hasDeckMutationResponsePayload(payload, options = {}) {
  const { expectedId } = options;
  const hasExpectedId = expectedId !== undefined;
  return (
    isObjectRecord(payload)
    && hasUsableDeckId(payload.id)
    && isNonBlankString(payload.name)
    && (!hasExpectedId || (hasUsableDeckId(expectedId) && hasSameDeckId(payload.id, expectedId)))
  );
}

function parseDeckMutationResponsePayload(payload, options = {}) {
  if (!hasDeckMutationResponsePayload(payload, options)) {
    throw new Error(MALFORMED_DECK_MUTATION_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_MUTATION_PAYLOAD_ERROR,
  hasDeckMutationResponsePayload,
  parseDeckMutationResponsePayload,
};
