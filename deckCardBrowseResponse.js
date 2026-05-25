const { isValidCardContent } = require('./cardContentValidation');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');
const {
  hasRouteSafeCardId,
  hasRouteSafeId,
  normalizeRouteSafeCardId,
  normalizeRouteSafeId,
} = require('./cardIdentifier');
const {
  getOwnArrayDataPropertyValue,
  getOwnDataPropertyValue,
  getOwnRecordPropertyDescriptor,
  hasOwnDataProperty,
  isDataPropertyDescriptor,
  isObjectRecord,
} = require('./recordDataProperty');

const MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR = 'Malformed deck-card browse payload';

function hasUsableId(value) {
  return hasRouteSafeCardId(value);
}

function hasSameDeckId(leftId, rightId) {
  const normalizedLeftId = normalizeRouteSafeId(leftId);
  const normalizedRightId = normalizeRouteSafeId(rightId);

  return normalizedLeftId !== null && normalizedLeftId === normalizedRightId;
}

function hasExpectedDeckAnchor(cardDeckId, expectedDeckId) {
  if (expectedDeckId === undefined) {
    return true;
  }

  return (
    hasRouteSafeId(expectedDeckId)
    && hasRouteSafeId(cardDeckId)
    && hasSameDeckId(cardDeckId, expectedDeckId)
  );
}

function hasDeckCardBrowseRowPayload(card, options = {}) {
  const { expectedDeckId } = options;
  if (!isObjectRecord(card)) {
    return false;
  }

  return (
    hasUsableId(getOwnDataPropertyValue(card, 'id'))
    && hasExpectedDeckAnchor(getOwnDataPropertyValue(card, 'deck_id'), expectedDeckId)
    && isValidCardContent(getOwnDataPropertyValue(card, 'front_content'))
    && isValidCardContent(getOwnDataPropertyValue(card, 'back_content'))
  );
}

function hasValidCursorFamily(cursor, createdAtKey, idKey) {
  const createdAt = getOwnDataPropertyValue(cursor, createdAtKey);
  const id = getOwnDataPropertyValue(cursor, idKey);

  return (
    hasOwnDataProperty(cursor, createdAtKey)
    && hasOwnDataProperty(cursor, idKey)
    && isValidIsoTimestamp(createdAt)
    && hasRouteSafeCardId(id)
  );
}

function hasInvalidCursorFamily(cursor, createdAtKey, idKey) {
  const createdAtDescriptor = getOwnRecordPropertyDescriptor(cursor, createdAtKey);
  const idDescriptor = getOwnRecordPropertyDescriptor(cursor, idKey);
  const hasCreatedAt = createdAtDescriptor !== undefined;
  const hasId = idDescriptor !== undefined;

  if (!hasCreatedAt && !hasId) {
    return false;
  }

  return (
    !isDataPropertyDescriptor(createdAtDescriptor)
    || !isDataPropertyDescriptor(idDescriptor)
    || !isValidIsoTimestamp(createdAtDescriptor.value)
    || !hasRouteSafeCardId(idDescriptor.value)
  );
}

function hasMatchingCursorFamilies(cursor) {
  const cursorCreatedAt = getOwnDataPropertyValue(cursor, 'cursorCreatedAt');
  const cursorId = getOwnDataPropertyValue(cursor, 'cursorId');
  const beforeCreatedAt = getOwnDataPropertyValue(cursor, 'beforeCreatedAt');
  const beforeId = getOwnDataPropertyValue(cursor, 'beforeId');
  const hasCursorFamily = (
    hasOwnDataProperty(cursor, 'cursorCreatedAt')
    && hasOwnDataProperty(cursor, 'cursorId')
  );
  const hasBeforeFamily = (
    hasOwnDataProperty(cursor, 'beforeCreatedAt')
    && hasOwnDataProperty(cursor, 'beforeId')
  );

  if (!hasCursorFamily || !hasBeforeFamily) {
    return true;
  }

  const normalizedCursorId = normalizeRouteSafeCardId(cursorId);
  const normalizedBeforeId = normalizeRouteSafeCardId(beforeId);

  if (
    normalizedCursorId === null
    || normalizedBeforeId === null
  ) {
    return false;
  }

  return (
    cursorCreatedAt === beforeCreatedAt
    && normalizedCursorId === normalizedBeforeId
  );
}

function parseDeckCardBrowseNextCursor(payload) {
  const nextCursorDescriptor = getOwnRecordPropertyDescriptor(payload, 'nextCursor');
  if (nextCursorDescriptor === undefined) {
    return null;
  }

  if (!isDataPropertyDescriptor(nextCursorDescriptor)) {
    throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
  }

  const nextCursor = nextCursorDescriptor.value;
  if (nextCursor === null) {
    return null;
  }

  if (!isObjectRecord(nextCursor)) {
    throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
  }

  if (
    hasInvalidCursorFamily(nextCursor, 'cursorCreatedAt', 'cursorId')
    || hasInvalidCursorFamily(nextCursor, 'beforeCreatedAt', 'beforeId')
    || !hasMatchingCursorFamilies(nextCursor)
  ) {
    throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
  }

  if (
    !hasValidCursorFamily(nextCursor, 'cursorCreatedAt', 'cursorId')
    && !hasValidCursorFamily(nextCursor, 'beforeCreatedAt', 'beforeId')
  ) {
    throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
  }

  return nextCursor;
}

function parseDeckCardBrowseResponsePayload(payload, options = {}) {
  const cardsDescriptor = getOwnRecordPropertyDescriptor(payload, 'cards');
  if (!isDataPropertyDescriptor(cardsDescriptor) || !Array.isArray(cardsDescriptor.value)) {
    throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
  }

  const cards = cardsDescriptor.value;
  // Use an index loop so sparse, inherited, or accessor-backed entries are
  // validated as own data entries before card fields are inspected.
  for (let index = 0; index < cards.length; index += 1) {
    const card = getOwnArrayDataPropertyValue(cards, index);
    if (!hasDeckCardBrowseRowPayload(card, options)) {
      throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
    }
  }

  return {
    cards,
    nextCursor: parseDeckCardBrowseNextCursor(payload),
  };
}

module.exports = {
  MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR,
  hasDeckCardBrowseRowPayload,
  hasMatchingCursorFamilies,
  parseDeckCardBrowseResponsePayload,
};
