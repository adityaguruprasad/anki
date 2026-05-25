const MALFORMED_DECK_MUTATION_PAYLOAD_ERROR = 'Malformed deck mutation payload';
const {
  MAX_POSTGRES_SERIAL_ID,
  normalizeRouteSafeId,
} = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');
const MAX_POSTGRES_SERIAL_ID_STRING = String(MAX_POSTGRES_SERIAL_ID);

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeDeckResponseId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 1 && value <= MAX_POSTGRES_SERIAL_ID
      ? String(value)
      : null;
  }

  if (typeof value === 'string') {
    const isCanonicalResponseId = (
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

    return isCanonicalResponseId ? value : null;
  }

  return null;
}

function hasUsableDeckId(value) {
  return normalizeDeckResponseId(value) !== null;
}

function hasUsableUserId(value) {
  // user_id intentionally reuses deck id bounds: both are PostgreSQL SERIAL-backed
  // backend integer identifiers in this API contract.
  return normalizeDeckResponseId(value) !== null;
}

function hasSameDeckId(responseId, expectedId) {
  const normalizedResponseId = normalizeDeckResponseId(responseId);
  const normalizedExpectedId = normalizeRouteSafeId(expectedId);

  return (
    normalizedResponseId !== null
    && normalizedExpectedId !== null
    && normalizedResponseId === normalizedExpectedId
  );
}

function hasDeckMutationResponsePayload(payload, options = {}) {
  if (!isObjectRecord(payload)) {
    return false;
  }

  const { expectedId } = options;
  const hasExpectedId = expectedId !== undefined;
  const id = getOwnDataPropertyValue(payload, 'id');
  const userId = getOwnDataPropertyValue(payload, 'user_id');
  const name = getOwnDataPropertyValue(payload, 'name');
  const description = getOwnDataPropertyValue(payload, 'description');
  const createdAt = getOwnDataPropertyValue(payload, 'created_at');

  return (
    hasUsableDeckId(id)
    && hasUsableUserId(userId)
    && isNonBlankString(name)
    && (description === null || typeof description === 'string')
    && isValidIsoTimestamp(createdAt)
    && (!hasExpectedId || hasSameDeckId(id, expectedId))
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
