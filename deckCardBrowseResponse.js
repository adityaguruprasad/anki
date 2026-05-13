const { isValidIsoTimestamp } = require('./isoTimestampValidation');

const MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR = 'Malformed deck-card browse payload';
const MAX_SAFE_INTEGER_TEXT = String(Number.MAX_SAFE_INTEGER);

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

function normalizeSafePositiveIntegerId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const normalized = trimmed.replace(/^0+/, '');
    if (normalized.length === 0) {
      return null;
    }

    if (
      normalized.length > MAX_SAFE_INTEGER_TEXT.length
      || (
        normalized.length === MAX_SAFE_INTEGER_TEXT.length
        && normalized > MAX_SAFE_INTEGER_TEXT
      )
    ) {
      return null;
    }

    return normalized;
  }

  return null;
}

function hasSafePositiveIntegerId(value) {
  return normalizeSafePositiveIntegerId(value) !== null;
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
    && isValidIsoTimestamp(cursor[createdAtKey])
    && hasSafePositiveIntegerId(cursor[idKey])
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
    || !isValidIsoTimestamp(cursor[createdAtKey])
    || !hasSafePositiveIntegerId(cursor[idKey])
  );
}

function hasMatchingCursorFamilies(cursor) {
  const hasCursorFamily = hasOwn(cursor, 'cursorCreatedAt') && hasOwn(cursor, 'cursorId');
  const hasBeforeFamily = hasOwn(cursor, 'beforeCreatedAt') && hasOwn(cursor, 'beforeId');

  if (!hasCursorFamily || !hasBeforeFamily) {
    return true;
  }

  const normalizedCursorId = normalizeSafePositiveIntegerId(cursor.cursorId);
  const normalizedBeforeId = normalizeSafePositiveIntegerId(cursor.beforeId);

  if (
    normalizedCursorId === null
    || normalizedBeforeId === null
  ) {
    return false;
  }

  return (
    cursor.cursorCreatedAt === cursor.beforeCreatedAt
    && normalizedCursorId === normalizedBeforeId
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
  hasMatchingCursorFamilies,
  parseDeckCardBrowseResponsePayload,
};
