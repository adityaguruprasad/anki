const MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR = 'Malformed deck-card mutation payload';
const { MAX_INTERVAL_DAYS, MIN_EASE_FACTOR } = require('./spacedRepetition');
const {
  hasRouteSafeCardId,
  hasRouteSafeId,
  hasSameRouteSafeCardId,
  normalizeRouteSafeId,
} = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasUsableCardId(value) {
  return hasRouteSafeCardId(value);
}

function hasSameCardId(leftId, rightId) {
  return hasSameRouteSafeCardId(leftId, rightId);
}

function hasSameDeckId(leftId, rightId) {
  const normalizedLeftId = normalizeRouteSafeId(leftId);
  const normalizedRightId = normalizeRouteSafeId(rightId);

  return normalizedLeftId !== null && normalizedLeftId === normalizedRightId;
}

function isNonBlankCardContent(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasValidMutationNextReview(card) {
  if (!hasOwn(card, 'next_review')) {
    return false;
  }

  return card.next_review === null || isValidIsoTimestamp(card.next_review);
}

function hasValidMutationSchedulingMetadata(card, options = {}) {
  // Create/update responses must carry scheduling metadata by default; smaller
  // contracts, such as delete-card echoes, opt out explicitly.
  if (options.requireSchedulingMetadata === false) {
    return true;
  }

  return (
    hasOwn(card, 'interval')
    && Number.isSafeInteger(card.interval)
    && card.interval >= 1
    && card.interval <= MAX_INTERVAL_DAYS
    && hasOwn(card, 'ease_factor')
    && typeof card.ease_factor === 'number'
    && Number.isFinite(card.ease_factor)
    && card.ease_factor >= MIN_EASE_FACTOR
    && hasOwn(card, 'review_count')
    && Number.isSafeInteger(card.review_count)
    && card.review_count >= 0
  );
}

function hasDeckCardMutationPayload(payload, options = {}) {
  const { expectedDeckId, expectedId } = options;
  const hasExpectedId = expectedId !== undefined;
  const hasExpectedDeckId = expectedDeckId !== undefined;

  return (
    isObjectRecord(payload)
    && hasUsableCardId(payload.id)
    && isNonBlankCardContent(payload.front_content)
    && isNonBlankCardContent(payload.back_content)
    && hasValidMutationNextReview(payload)
    && hasValidMutationSchedulingMetadata(payload, options)
    && (!hasExpectedId || (hasUsableCardId(expectedId) && hasSameCardId(payload.id, expectedId)))
    && (
      !hasExpectedDeckId
      || (
        hasRouteSafeId(expectedDeckId)
        && hasRouteSafeId(payload.deck_id)
        && hasSameDeckId(payload.deck_id, expectedDeckId)
      )
    )
  );
}

function parseDeckCardMutationResponsePayload(payload, options = {}) {
  if (!hasDeckCardMutationPayload(payload, options)) {
    throw new Error(MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR,
  hasDeckCardMutationPayload,
  parseDeckCardMutationResponsePayload,
};
