const MALFORMED_DECK_MUTATION_PAYLOAD_ERROR = 'Malformed deck mutation payload';
const MAX_POSTGRES_SERIAL_ID = 2147483647;
const MAX_POSTGRES_SERIAL_ID_STRING = String(MAX_POSTGRES_SERIAL_ID);

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableDeckId(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= MAX_POSTGRES_SERIAL_ID;
  }

  if (typeof value === 'string') {
    return (
      /^[1-9]\d*$/.test(value)
      && (
        value.length < MAX_POSTGRES_SERIAL_ID_STRING.length
        || (
          value.length === MAX_POSTGRES_SERIAL_ID_STRING.length
          // PostgreSQL SERIAL stores int4 ids, so equal-length digit strings can be compared lexicographically.
          && value <= MAX_POSTGRES_SERIAL_ID_STRING
        )
      )
    );
  }

  return false;
}

function hasSameDeckId(leftId, rightId) {
  return hasUsableDeckId(leftId)
    && hasUsableDeckId(rightId)
    && String(leftId) === String(rightId);
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
