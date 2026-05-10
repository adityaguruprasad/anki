const MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR = 'Malformed deck-card browse payload';

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasUsableId(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return isNonBlankString(value);
}

function hasDeckCardBrowseRowPayload(card) {
  return (
    isObjectRecord(card)
    && hasUsableId(card.id)
    && isNonBlankString(card.front_content)
    && isNonBlankString(card.back_content)
  );
}

function hasValidCursorFamily(cursor, createdAtKey, idKey) {
  return (
    hasOwn(cursor, createdAtKey)
    && hasOwn(cursor, idKey)
    && isNonBlankString(cursor[createdAtKey])
    && hasUsableId(cursor[idKey])
  );
}

function hasInvalidCursorFamily(cursor, createdAtKey, idKey) {
  const hasCreatedAt = hasOwn(cursor, createdAtKey);
  const hasId = hasOwn(cursor, idKey);

  if (!hasCreatedAt && !hasId) {
    return false;
  }

  return (
    !hasCreatedAt
    || !hasId
    || !isNonBlankString(cursor[createdAtKey])
    || !hasUsableId(cursor[idKey])
  );
}

function hasMatchingCursorFamilies(cursor) {
  if (
    !hasValidCursorFamily(cursor, 'cursorCreatedAt', 'cursorId')
    || !hasValidCursorFamily(cursor, 'beforeCreatedAt', 'beforeId')
  ) {
    return true;
  }

  return (
    cursor.cursorCreatedAt === cursor.beforeCreatedAt
    && String(cursor.cursorId).trim() === String(cursor.beforeId).trim()
  );
}

function parseDeckCardBrowseNextCursor(payload) {
  if (!hasOwn(payload, 'nextCursor') || payload.nextCursor === null) {
    return null;
  }

  const { nextCursor } = payload;
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

function parseDeckCardBrowseResponsePayload(payload) {
  if (!isObjectRecord(payload) || !Array.isArray(payload.cards)) {
    throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
  }

  for (const card of payload.cards) {
    if (!hasDeckCardBrowseRowPayload(card)) {
      throw new Error(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR);
    }
  }

  return {
    cards: payload.cards,
    nextCursor: parseDeckCardBrowseNextCursor(payload),
  };
}

module.exports = {
  MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR,
  hasDeckCardBrowseRowPayload,
  parseDeckCardBrowseResponsePayload,
};
