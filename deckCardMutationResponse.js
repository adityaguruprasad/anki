const { isValidCardContent } = require('./cardContentValidation');
const MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR = 'Malformed deck-card mutation payload';
const { MAX_INTERVAL_DAYS, MIN_EASE_FACTOR } = require('./spacedRepetition');
const {
  hasRouteSafeCardId,
  hasRouteSafeId,
  hasSameRouteSafeCardId,
  normalizeRouteSafeId,
} = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

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

function hasValidMutationNextReview(card) {
  const nextReview = getOwnDataPropertyValue(card, 'next_review');

  return nextReview === null || isValidIsoTimestamp(nextReview);
}

function hasValidMutationSchedulingMetadata(card, options = {}) {
  // Create/update responses must carry scheduling metadata by default; smaller
  // contracts, such as delete-card echoes, opt out explicitly.
  if (options.requireSchedulingMetadata === false) {
    return true;
  }

  const interval = getOwnDataPropertyValue(card, 'interval');
  const easeFactor = getOwnDataPropertyValue(card, 'ease_factor');
  const reviewCount = getOwnDataPropertyValue(card, 'review_count');

  return (
    Number.isSafeInteger(interval)
    && interval >= 1
    && interval <= MAX_INTERVAL_DAYS
    && typeof easeFactor === 'number'
    && Number.isFinite(easeFactor)
    && easeFactor >= MIN_EASE_FACTOR
    && Number.isSafeInteger(reviewCount)
    && reviewCount >= 0
  );
}

function hasDeckCardMutationPayload(payload, options = {}) {
  const { expectedDeckId, expectedId } = options;
  const hasExpectedId = expectedId !== undefined;
  const hasExpectedDeckId = expectedDeckId !== undefined;
  const id = getOwnDataPropertyValue(payload, 'id');
  const deckId = getOwnDataPropertyValue(payload, 'deck_id');
  const frontContent = getOwnDataPropertyValue(payload, 'front_content');
  const backContent = getOwnDataPropertyValue(payload, 'back_content');

  return (
    isObjectRecord(payload)
    && hasUsableCardId(id)
    && isValidCardContent(frontContent)
    && isValidCardContent(backContent)
    && hasValidMutationNextReview(payload)
    && hasValidMutationSchedulingMetadata(payload, options)
    && (!hasExpectedId || (hasUsableCardId(expectedId) && hasSameCardId(id, expectedId)))
    && (
      !hasExpectedDeckId
      || (
        hasRouteSafeId(expectedDeckId)
        && hasRouteSafeId(deckId)
        && hasSameDeckId(deckId, expectedDeckId)
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
