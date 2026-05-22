const { validateCardContent } = require('./cardContentValidation');
const { validateDeckName } = require('./deckNameValidation');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');
const { MAX_INTERVAL_DAYS, MIN_EASE_FACTOR } = require('./spacedRepetition');

const BROWSE_CARDS_DEFAULT_LIMIT = 50;
const BROWSE_CARDS_MAX_LIMIT = 100;
// Match the max due-card fetch window so omitted limits stay bounded without
// changing the explicit limit contract.
const DUE_CARDS_DEFAULT_LIMIT = BROWSE_CARDS_MAX_LIMIT;
const BROWSE_CARDS_MAX_SEARCH_LENGTH = 200;
const CREATE_CARD_NEXT_REVIEW_SQL_EXPRESSION = 'NOW()';
const CREATE_CARD_REQUIRE_NEXT_REVIEW = true;
const CREATE_CARD_INITIAL_INTERVAL = 1;
const CREATE_CARD_INITIAL_EASE_FACTOR = 2.5;
const CREATE_CARD_INITIAL_REVIEW_COUNT = 0;
// anki.db uses PostgreSQL SERIAL/INTEGER ids; reject impossible ids before
// they reach hot API queries where PostgreSQL would raise int4 range errors.
const MAX_POSTGRES_SERIAL_ID = 2147483647;
const MAX_POSTGRES_SERIAL_ID_TEXT = String(MAX_POSTGRES_SERIAL_ID);
const MAX_SAFE_INTEGER_TEXT = String(Number.MAX_SAFE_INTEGER);
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const AGGREGATE_DECIMAL_TEXT_PATTERN = /^\d+(?:\.\d+)?$/;
const CARD_OWNERSHIP_PROOF_FIELD = '__owned_user_id';
const CARD_DECK_OWNERSHIP_PROOF_FIELD = '__owned_deck_id';
const CARD_READ_FIELDS = Object.freeze([
  'id',
  'deck_id',
  'front_content',
  'back_content',
  'created_at',
  'last_reviewed',
  'next_review',
  'interval',
  'review_count',
  'ease_factor',
]);
const EMPTY_CARD_LIST_ROW_ALLOWED_FIELDS = Object.freeze([
  ...CARD_READ_FIELDS,
  CARD_OWNERSHIP_PROOF_FIELD,
  '__owned_deck_id',
  '__cursor_created_at',
]);
const CARD_READ_SELECT_LIST = CARD_READ_FIELDS
  .map((field) => `c.${field}`)
  .join(',\n              ');
const DECK_READ_FIELDS = Object.freeze([
  'id',
  'user_id',
  'name',
  'description',
  'created_at',
]);
const DECK_READ_SELECT_LIST = DECK_READ_FIELDS
  .map((field) => `d.${field}`)
  .join(',\n         ');
const STUDY_SESSION_RESPONSE_CARD_FIELDS = Object.freeze([
  'id',
  'next_review',
  'interval',
  'ease_factor',
  'review_count',
  'last_reviewed',
]);
const CARD_MUTATION_RESPONSE_CARD_FIELDS = Object.freeze([
  'id',
  'deck_id',
  'front_content',
  'back_content',
  'next_review',
  'interval',
  'ease_factor',
  'review_count',
]);
const DELETE_CARD_RESPONSE_CARD_FIELDS = Object.freeze([
  'id',
  'deck_id',
  'front_content',
  'back_content',
  'next_review',
]);
const STATS_RESPONSE_FIELDS = Object.freeze([
  'totalCards',
  'totalDecks',
  'todayReviews',
  'weekReviews',
  'monthReviews',
]);
const SCHEDULING_INSIGHTS_COUNT_FIELDS = Object.freeze([
  'totalCards',
  'overdue',
  'dueToday',
  'dueTomorrow',
  'dueNext7Days',
  'leechCandidates',
]);
const SCHEDULING_INSIGHTS_RESPONSE_FIELDS = Object.freeze([
  ...SCHEDULING_INSIGHTS_COUNT_FIELDS,
  'averageEaseFactor',
]);
const RECOMMENDED_DAILY_REVIEW_TARGET_NUMERATOR = 6;
const RECOMMENDED_DAILY_REVIEW_TARGET_DENOMINATOR = 5;
const INVALID_SCHEDULER_OUTPUT_ERROR = 'Invalid scheduler output';
const INVALID_STUDY_SESSION_CARD_READ_RESULT_ERROR = 'Invalid study-session card read result';
const INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR = 'Invalid study-session update result';
const INVALID_CARD_MUTATION_RESULT_ERROR = 'Invalid card mutation result';
const INVALID_CARD_REMOVAL_RESULT_ERROR = 'Invalid card removal result';
const INVALID_CARD_READ_RESULT_ERROR = 'Invalid card read result';
const INVALID_DECK_LIST_RESULT_ERROR = 'Invalid deck-list result';
const INVALID_DECK_RENAME_CONTROL_RESULT_ERROR = 'Invalid deck rename control result';
const INVALID_DECK_MUTATION_RESULT_ERROR = 'Invalid deck mutation result';
const INVALID_DECK_REMOVAL_RESULT_ERROR = 'Invalid deck removal result';
const INVALID_CARD_BROWSE_CURSOR_RESULT_ERROR = 'Invalid card browse cursor result';
const INVALID_STATS_RESULT_ERROR = 'Invalid stats result';
const INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR = 'Invalid scheduling-insights result';
const INVALID_AUTH_PRINCIPAL_ERROR = 'Invalid authenticated user principal';
// Keep in sync with the schema/migration-defined decks_user_id_normalized_name_unique_idx.
const DUPLICATE_DECK_NAME_CONSTRAINTS = new Set([
  'decks_user_id_normalized_name_unique_idx',
]);

function isValidQuality(quality) {
  return Number.isInteger(quality) && quality >= 0 && quality <= 5;
}

function toAuthenticatedUserId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_POSTGRES_SERIAL_ID
      ? value
      : null;
  }

  if (typeof value === 'string') {
    if (!/^[1-9]\d*$/.test(value)) {
      return null;
    }

    const isWithinPostgresSerialRange = (
      value.length < MAX_POSTGRES_SERIAL_ID_TEXT.length
      || (
        value.length === MAX_POSTGRES_SERIAL_ID_TEXT.length
        && value <= MAX_POSTGRES_SERIAL_ID_TEXT
      )
    );
    if (!isWithinPostgresSerialRange) {
      return null;
    }

    return Number(value);
  }

  return null;
}

function getAuthenticatedUserId(req) {
  if (
    req === null
    || typeof req !== 'object'
    || Array.isArray(req)
    || !Object.hasOwn(req, 'user')
  ) {
    throw new TypeError(INVALID_AUTH_PRINCIPAL_ERROR);
  }

  const user = req.user;
  if (
    user === null
    || typeof user !== 'object'
    || Array.isArray(user)
    || !Object.hasOwn(user, 'userId')
  ) {
    throw new TypeError(INVALID_AUTH_PRINCIPAL_ERROR);
  }

  const authenticatedUserId = toAuthenticatedUserId(user.userId);
  if (authenticatedUserId === null) {
    throw new TypeError(INVALID_AUTH_PRINCIPAL_ERROR);
  }

  return authenticatedUserId;
}

function isValidSchedulerNextReview(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  return isValidIsoTimestamp(value);
}

function assertValidSchedulingUpdate(schedule) {
  assertObjectHasOwnFields(
    schedule,
    ['interval', 'ease_factor', 'next_review'],
    INVALID_SCHEDULER_OUTPUT_ERROR
  );

  const { interval, ease_factor, next_review } = schedule;

  if (
    !Number.isSafeInteger(interval)
    || interval < 1
    || interval > MAX_INTERVAL_DAYS
  ) {
    throw new TypeError(INVALID_SCHEDULER_OUTPUT_ERROR);
  }

  if (
    typeof ease_factor !== 'number'
    || !Number.isFinite(ease_factor)
    || ease_factor < MIN_EASE_FACTOR
  ) {
    throw new TypeError(INVALID_SCHEDULER_OUTPUT_ERROR);
  }

  if (!isValidSchedulerNextReview(next_review)) {
    throw new TypeError(INVALID_SCHEDULER_OUTPUT_ERROR);
  }
}

function assertStudySessionCardReadResult(row, expectedCardId, expectedUserId) {
  assertCardReadResult(row, INVALID_STUDY_SESSION_CARD_READ_RESULT_ERROR);
  assertExpectedCardOwner(row, expectedUserId, INVALID_STUDY_SESSION_CARD_READ_RESULT_ERROR);

  if (
    validatePositiveIntegerIdentifier(row.id, 'cardId').value !== expectedCardId
    || !Object.hasOwn(row, '__is_due')
    || typeof row.__is_due !== 'boolean'
  ) {
    throw new TypeError(INVALID_STUDY_SESSION_CARD_READ_RESULT_ERROR);
  }
}

function assertStudySessionUpdateControlResult(row, expectedUserId) {
  assertObjectHasOwnFields(
    row,
    ['__updated'],
    INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR
  );
  assertExpectedCardOwner(row, expectedUserId, INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR);

  if (typeof row.__updated !== 'boolean') {
    throw new TypeError(INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR);
  }
}

function assertStudySessionUpdateConflict(row, expectedUserId) {
  assertObjectHasOwnFields(
    row,
    [...STUDY_SESSION_RESPONSE_CARD_FIELDS, '__updated'],
    INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR
  );
  assertStudySessionUpdateControlResult(row, expectedUserId);

  if (
    row.__updated !== false
    || STUDY_SESSION_RESPONSE_CARD_FIELDS.some((field) => row[field] !== null)
  ) {
    throw new TypeError(INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR);
  }
}

function assertStudySessionUpdateSucceeded(row, expectedCardId, expectedUserId, expectedSchedule) {
  assertObjectHasOwnFields(
    row,
    [...STUDY_SESSION_RESPONSE_CARD_FIELDS, '__updated'],
    INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR
  );
  assertStudySessionUpdateControlResult(row, expectedUserId);

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  const hasExpectedSchedule = (
    expectedSchedule !== null
    && typeof expectedSchedule === 'object'
    && !Array.isArray(expectedSchedule)
  );
  if (
    row.__updated !== true
    || !cardIdValidation.ok
    || cardIdValidation.value !== expectedCardId
    || !hasExpectedSchedule
    || row.interval !== expectedSchedule.interval
    || row.ease_factor !== expectedSchedule.ease_factor
    || !isSameDatabaseTimestamp(row.next_review, expectedSchedule.next_review)
    || !isValidRequiredDatabaseTimestamp(row.next_review)
    || !isValidPersistedCardInterval(row.interval)
    || !isValidPersistedEaseFactor(row.ease_factor)
    || !isValidPersistedReviewCount(row.review_count)
    || !isValidRequiredDatabaseTimestamp(row.last_reviewed)
    || !isLaterDatabaseTimestamp(row.next_review, row.last_reviewed)
  ) {
    throw new TypeError(INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR);
  }
}

function validatePositiveIntegerIdentifier(value, fieldName) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0 && value <= MAX_POSTGRES_SERIAL_ID) {
      return { ok: true, value };
    }
    return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > MAX_SAFE_INTEGER_TEXT.length) {
      return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
    }

    if (/^\d+$/.test(trimmed)) {
      const normalizedDigits = trimmed.replace(/^0+/, '');
      const isWithinPostgresSerialRange = (
        normalizedDigits.length < MAX_POSTGRES_SERIAL_ID_TEXT.length
        || (
          normalizedDigits.length === MAX_POSTGRES_SERIAL_ID_TEXT.length
          && normalizedDigits <= MAX_POSTGRES_SERIAL_ID_TEXT
        )
      );

      if (normalizedDigits.length > 0 && isWithinPostgresSerialRange) {
        return { ok: true, value: Number(normalizedDigits) };
      }
    }
  }

  return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
}

function toNormalizedAggregateCount(value, errorMessage, { allowUnsafeString = false } = {}) {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const normalizedDigits = trimmed.replace(/^0+/, '') || '0';
      const isWithinSafeIntegerRange = (
        normalizedDigits.length < MAX_SAFE_INTEGER_TEXT.length
        || (
          normalizedDigits.length === MAX_SAFE_INTEGER_TEXT.length
          && normalizedDigits <= MAX_SAFE_INTEGER_TEXT
        )
      );

      if (isWithinSafeIntegerRange) {
        return Number(normalizedDigits);
      }

      if (allowUnsafeString) {
        return normalizedDigits;
      }
    }
  }

  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'bigint' && value >= 0n) {
    if (value <= MAX_SAFE_INTEGER_BIGINT) {
      return Number(value);
    }

    if (allowUnsafeString) {
      return String(value);
    }
  }

  throw new TypeError(errorMessage);
}

function toStatsAggregateCount(value) {
  return toNormalizedAggregateCount(value, INVALID_STATS_RESULT_ERROR, {
    allowUnsafeString: true,
  });
}

function toDeckListAggregateCount(value) {
  return toNormalizedAggregateCount(value, INVALID_DECK_LIST_RESULT_ERROR);
}

function toSafeAggregateCount(value, errorMessage) {
  return toNormalizedAggregateCount(value, errorMessage);
}

function toRequiredNullableAverageEaseFactor(value, errorMessage) {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= MIN_EASE_FACTOR) {
      return value;
    }

    throw new TypeError(errorMessage);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!AGGREGATE_DECIMAL_TEXT_PATTERN.test(trimmed)) {
      throw new TypeError(errorMessage);
    }

    const number = Number(trimmed);
    if (Number.isFinite(number) && number >= MIN_EASE_FACTOR) {
      return number;
    }
  }

  throw new TypeError(errorMessage);
}

function getDueCardPredicate(tableAlias = 'c') {
  return `(${tableAlias}.next_review IS NULL OR ${tableAlias}.next_review <= NOW())`;
}

function assertObjectHasOwnFields(row, fields, errorMessage) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError(errorMessage);
  }

  for (const field of fields) {
    if (!Object.hasOwn(row, field)) {
      throw new TypeError(errorMessage);
    }
  }
}

function isValidDatabaseTimestamp(value) {
  if (value === null) {
    return true;
  }

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  return isValidIsoTimestamp(value);
}

function isValidRequiredDatabaseTimestamp(value) {
  return value !== null && isValidDatabaseTimestamp(value);
}

function toDatabaseTimestampMilliseconds(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (!isValidIsoTimestamp(value)) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isLaterDatabaseTimestamp(value, earlierValue) {
  const timestamp = toDatabaseTimestampMilliseconds(value);
  const earlierTimestamp = toDatabaseTimestampMilliseconds(earlierValue);

  return (
    timestamp !== null
    && earlierTimestamp !== null
    && timestamp > earlierTimestamp
  );
}

function isSameDatabaseTimestamp(value, expectedValue) {
  const timestamp = toDatabaseTimestampMilliseconds(value);
  const expectedTimestamp = toDatabaseTimestampMilliseconds(expectedValue);

  return (
    timestamp !== null
    && expectedTimestamp !== null
    && timestamp === expectedTimestamp
  );
}

function isValidPersistedCardContent(value) {
  return validateCardContent(value, 'cardContent').ok;
}

function isValidPersistedCardInterval(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_INTERVAL_DAYS;
}

function isValidPersistedEaseFactor(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_EASE_FACTOR;
}

function isValidPersistedReviewCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidPersistedDeckDescription(value) {
  return value === null || typeof value === 'string';
}

function matchesExpectedIdentifier(validation, expectedValue, fieldName) {
  if (expectedValue === undefined) {
    return true;
  }

  const expectedValidation = validatePositiveIntegerIdentifier(expectedValue, fieldName);
  return expectedValidation.ok && validation.value === expectedValidation.value;
}

function assertExpectedDeckOwner(row, expectedUserId, errorMessage) {
  if (
    expectedUserId === undefined
    || expectedUserId === null
    || row.user_id !== expectedUserId
  ) {
    throw new TypeError(errorMessage);
  }
}

function assertExpectedCardOwner(row, expectedUserId, errorMessage) {
  assertObjectHasOwnFields(row, [CARD_OWNERSHIP_PROOF_FIELD], errorMessage);

  if (
    expectedUserId === undefined
    || expectedUserId === null
    || row[CARD_OWNERSHIP_PROOF_FIELD] !== expectedUserId
  ) {
    throw new TypeError(errorMessage);
  }
}

function assertCardDeckOwnershipProof(row, deckIdValidation, errorMessage) {
  assertObjectHasOwnFields(row, [CARD_DECK_OWNERSHIP_PROOF_FIELD], errorMessage);

  const ownedDeckIdValidation = validatePositiveIntegerIdentifier(
    row[CARD_DECK_OWNERSHIP_PROOF_FIELD],
    'deckId'
  );
  if (
    !ownedDeckIdValidation.ok
    || ownedDeckIdValidation.value !== deckIdValidation.value
  ) {
    throw new TypeError(errorMessage);
  }
}

function assertCardMutationResult(row, options = {}) {
  assertObjectHasOwnFields(row, CARD_MUTATION_RESPONSE_CARD_FIELDS, INVALID_CARD_MUTATION_RESULT_ERROR);
  assertExpectedCardOwner(row, options.expectedUserId, INVALID_CARD_MUTATION_RESULT_ERROR);

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  const deckIdValidation = validatePositiveIntegerIdentifier(row.deck_id, 'deckId');
  if (
    !cardIdValidation.ok
    || !deckIdValidation.ok
    || !matchesExpectedIdentifier(cardIdValidation, options.expectedCardId, 'cardId')
    || !matchesExpectedIdentifier(deckIdValidation, options.expectedDeckId, 'deckId')
    || !isValidPersistedCardContent(row.front_content)
    || !isValidPersistedCardContent(row.back_content)
    || !isValidDatabaseTimestamp(row.next_review)
    || !isValidPersistedCardInterval(row.interval)
    || !isValidPersistedEaseFactor(row.ease_factor)
    || !isValidPersistedReviewCount(row.review_count)
  ) {
    throw new TypeError(INVALID_CARD_MUTATION_RESULT_ERROR);
  }

  if (
    (options.requireNextReview && !isValidRequiredDatabaseTimestamp(row.next_review))
    || (Object.hasOwn(options, 'expectedInterval') && row.interval !== options.expectedInterval)
    || (Object.hasOwn(options, 'expectedEaseFactor') && row.ease_factor !== options.expectedEaseFactor)
    || (Object.hasOwn(options, 'expectedReviewCount') && row.review_count !== options.expectedReviewCount)
  ) {
    throw new TypeError(INVALID_CARD_MUTATION_RESULT_ERROR);
  }

  if (options.requireDeckOwnershipProof) {
    assertCardDeckOwnershipProof(row, deckIdValidation, INVALID_CARD_MUTATION_RESULT_ERROR);
  }
}

function assertCardRemovalResult(row, options = {}) {
  assertObjectHasOwnFields(row, DELETE_CARD_RESPONSE_CARD_FIELDS, INVALID_CARD_REMOVAL_RESULT_ERROR);
  assertExpectedCardOwner(row, options.expectedUserId, INVALID_CARD_REMOVAL_RESULT_ERROR);

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  if (
    !cardIdValidation.ok
    || !matchesExpectedIdentifier(cardIdValidation, options.expectedCardId, 'cardId')
    || !isValidPersistedCardContent(row.front_content)
    || !isValidPersistedCardContent(row.back_content)
    || !isValidDatabaseTimestamp(row.next_review)
  ) {
    throw new TypeError(INVALID_CARD_REMOVAL_RESULT_ERROR);
  }

  if (options.requireDeckOwnershipProof) {
    assertObjectHasOwnFields(row, ['deck_id'], INVALID_CARD_REMOVAL_RESULT_ERROR);
    const deckIdValidation = validatePositiveIntegerIdentifier(row.deck_id, 'deckId');
    if (!deckIdValidation.ok) {
      throw new TypeError(INVALID_CARD_REMOVAL_RESULT_ERROR);
    }
    assertCardDeckOwnershipProof(row, deckIdValidation, INVALID_CARD_REMOVAL_RESULT_ERROR);
  }
}

function assertCardReadResult(row, errorMessage = INVALID_CARD_READ_RESULT_ERROR) {
  assertObjectHasOwnFields(
    row,
    CARD_READ_FIELDS,
    errorMessage
  );

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  const deckIdValidation = validatePositiveIntegerIdentifier(row.deck_id, 'deckId');
  if (
    !cardIdValidation.ok
    || !deckIdValidation.ok
    || !isValidPersistedCardContent(row.front_content)
    || !isValidPersistedCardContent(row.back_content)
  ) {
    throw new TypeError(errorMessage);
  }

  if (!isValidRequiredDatabaseTimestamp(row.created_at)) {
    throw new TypeError(errorMessage);
  }

  const nullableTimestampFields = ['last_reviewed', 'next_review'];
  for (const fieldName of nullableTimestampFields) {
    if (!isValidDatabaseTimestamp(row[fieldName])) {
      throw new TypeError(errorMessage);
    }
  }

  if (
    row.last_reviewed !== null
    && row.next_review !== null
    && !isLaterDatabaseTimestamp(row.next_review, row.last_reviewed)
  ) {
    throw new TypeError(errorMessage);
  }

  if (!isValidPersistedCardInterval(row.interval)) {
    throw new TypeError(errorMessage);
  }

  if (!isValidPersistedEaseFactor(row.ease_factor)) {
    throw new TypeError(errorMessage);
  }

  if (!isValidPersistedReviewCount(row.review_count)) {
    throw new TypeError(errorMessage);
  }
}

function assertDeckReadResult(row, errorMessage, options = {}) {
  assertObjectHasOwnFields(row, DECK_READ_FIELDS, errorMessage);

  const deckIdValidation = validatePositiveIntegerIdentifier(row.id, 'deckId');
  const deckNameValidation = validateDeckName(row.name);
  if (
    !deckIdValidation.ok
    || !matchesExpectedIdentifier(deckIdValidation, options.expectedDeckId, 'deckId')
    || !deckNameValidation.ok
    // Response rows must already be canonical persisted names, not merely normalizable input.
    || deckNameValidation.value !== row.name
    || !isValidPersistedDeckDescription(row.description)
    || !isValidRequiredDatabaseTimestamp(row.created_at)
  ) {
    throw new TypeError(errorMessage);
  }

  assertExpectedDeckOwner(row, options.expectedUserId, errorMessage);
}

function assertDeckMutationResult(row, options = {}) {
  assertDeckReadResult(row, INVALID_DECK_MUTATION_RESULT_ERROR, options);
}

function assertDeckRemovalResult(row, options = {}) {
  assertObjectHasOwnFields(row, ['id', 'user_id'], INVALID_DECK_REMOVAL_RESULT_ERROR);

  const deckIdValidation = validatePositiveIntegerIdentifier(row.id, 'deckId');
  if (
    !deckIdValidation.ok
    || !matchesExpectedIdentifier(deckIdValidation, options.expectedDeckId, 'deckId')
  ) {
    throw new TypeError(INVALID_DECK_REMOVAL_RESULT_ERROR);
  }

  assertExpectedDeckOwner(row, options.expectedUserId, INVALID_DECK_REMOVAL_RESULT_ERROR);
}

function assertDeckRenameControlResult(row, options = {}) {
  assertObjectHasOwnFields(
    row,
    ['deckExists', 'duplicateExists', 'deck'],
    INVALID_DECK_RENAME_CONTROL_RESULT_ERROR
  );

  if (
    typeof row.deckExists !== 'boolean'
    || typeof row.duplicateExists !== 'boolean'
  ) {
    throw new TypeError(INVALID_DECK_RENAME_CONTROL_RESULT_ERROR);
  }

  if (!row.deckExists || row.duplicateExists) {
    if (row.deck !== null) {
      throw new TypeError(INVALID_DECK_RENAME_CONTROL_RESULT_ERROR);
    }
    return;
  }

  assertDeckMutationResult(row.deck, {
    expectedDeckId: options.expectedDeckId,
    expectedUserId: options.expectedUserId,
  });
}

function assertDeckListResult(row, options = {}) {
  assertDeckReadResult(row, INVALID_DECK_LIST_RESULT_ERROR, options);
  assertObjectHasOwnFields(
    row,
    ['totalCards', 'dueCards'],
    INVALID_DECK_LIST_RESULT_ERROR
  );
}

function assertCardBrowseCursorResult(row) {
  assertObjectHasOwnFields(
    row,
    ['id', '__cursor_created_at'],
    INVALID_CARD_BROWSE_CURSOR_RESULT_ERROR
  );

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  if (!cardIdValidation.ok || !isValidIsoTimestamp(row.__cursor_created_at)) {
    throw new TypeError(INVALID_CARD_BROWSE_CURSOR_RESULT_ERROR);
  }
}

function assertCardListRowAnchoredToDeck(row, deckId, options = {}) {
  assertObjectHasOwnFields(row, ['id', '__owned_deck_id'], INVALID_CARD_READ_RESULT_ERROR);
  if (options.expectedUserId !== undefined) {
    assertExpectedCardOwner(row, options.expectedUserId, INVALID_CARD_READ_RESULT_ERROR);
  }

  const ownedDeckIdValidation = validatePositiveIntegerIdentifier(row.__owned_deck_id, 'deckId');
  if (!ownedDeckIdValidation.ok || ownedDeckIdValidation.value !== deckId) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  if (row.id === null) {
    assertEmptyCardListRow(row, options);
    return;
  }

  assertObjectHasOwnFields(row, ['deck_id'], INVALID_CARD_READ_RESULT_ERROR);
  const cardDeckIdValidation = validatePositiveIntegerIdentifier(row.deck_id, 'deckId');
  if (!cardDeckIdValidation.ok || cardDeckIdValidation.value !== deckId) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }
}

function assertDueCardListRow(row, deckId, options = {}) {
  assertCardListRowAnchoredToDeck(row, deckId, {
    expectedUserId: options.expectedUserId,
    allowedEmptySidecarFields: ['__is_due'],
  });
  assertObjectHasOwnFields(row, ['__is_due'], INVALID_CARD_READ_RESULT_ERROR);

  if (row.id === null) {
    if (row.__is_due !== null) {
      throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
    }
    return;
  }

  if (row.__is_due !== true) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }
}

function normalizeAllowedEmptySidecarFields(options = {}) {
  const allowedEmptySidecarFields = options?.allowedEmptySidecarFields;
  if (allowedEmptySidecarFields === undefined) {
    return [];
  }

  if (!Array.isArray(allowedEmptySidecarFields)) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  return allowedEmptySidecarFields;
}

function assertEmptyCardListRow(row, options = {}) {
  assertObjectHasOwnFields(row, CARD_READ_FIELDS, INVALID_CARD_READ_RESULT_ERROR);
  const allowedEmptySidecarFields = normalizeAllowedEmptySidecarFields(options);
  const allowedFields = [
    ...EMPTY_CARD_LIST_ROW_ALLOWED_FIELDS,
    ...allowedEmptySidecarFields,
  ];

  if (
    Reflect.ownKeys(row).some(
      (field) => !allowedFields.includes(field)
    )
  ) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  if (CARD_READ_FIELDS.some((field) => row[field] !== null)) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  if (
    Object.hasOwn(row, '__cursor_created_at')
    && row.__cursor_created_at !== null
  ) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  if (
    allowedEmptySidecarFields.some((field) => Object.hasOwn(row, field) && row[field] !== null)
  ) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }
}

function assertStatsResult(row) {
  assertObjectHasOwnFields(row, STATS_RESPONSE_FIELDS, INVALID_STATS_RESULT_ERROR);
}

function toAggregateCountBigInt(value, errorMessage) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  throw new TypeError(errorMessage);
}

function assertStatsCountInvariants(stats) {
  const totalCards = toAggregateCountBigInt(stats.totalCards, INVALID_STATS_RESULT_ERROR);
  const todayReviews = toAggregateCountBigInt(stats.todayReviews, INVALID_STATS_RESULT_ERROR);
  const weekReviews = toAggregateCountBigInt(stats.weekReviews, INVALID_STATS_RESULT_ERROR);
  const monthReviews = toAggregateCountBigInt(stats.monthReviews, INVALID_STATS_RESULT_ERROR);

  // These buckets count current cards by last_reviewed, not review events.
  if (
    todayReviews > weekReviews
    || weekReviews > monthReviews
    || monthReviews > totalCards
  ) {
    throw new TypeError(INVALID_STATS_RESULT_ERROR);
  }
}

function assertSchedulingInsightsResult(row) {
  assertObjectHasOwnFields(
    row,
    SCHEDULING_INSIGHTS_RESPONSE_FIELDS,
    INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
  );
}

function assertSchedulingInsightsCountInvariants(counts) {
  for (const field of SCHEDULING_INSIGHTS_COUNT_FIELDS) {
    if (!Number.isSafeInteger(counts[field]) || counts[field] < 0) {
      throw new TypeError(INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR);
    }
  }

  const {
    totalCards,
    overdue,
    dueToday,
    dueTomorrow,
    dueNext7Days,
    leechCandidates,
  } = counts;

  if (
    overdue > totalCards
    || dueToday > totalCards
    || dueTomorrow > totalCards
    || dueNext7Days > totalCards
    || leechCandidates > totalCards
    || dueToday + dueTomorrow > dueNext7Days
    || overdue + dueNext7Days > totalCards
  ) {
    throw new TypeError(INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR);
  }
}

function toSafeCeilScaledInteger(value, numerator, denominator, errorMessage) {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || !Number.isSafeInteger(numerator)
    || numerator <= 0
    || !Number.isSafeInteger(denominator)
    || denominator <= 0
  ) {
    throw new TypeError(errorMessage);
  }

  const result = (
    BigInt(value) * BigInt(numerator) + BigInt(denominator - 1)
  ) / BigInt(denominator);
  if (result > MAX_SAFE_INTEGER_BIGINT) {
    throw new TypeError(errorMessage);
  }

  return Number(result);
}

function toRecommendedDailyReviewTarget(focusLoad) {
  return Math.max(
    10,
    toSafeCeilScaledInteger(
      focusLoad,
      RECOMMENDED_DAILY_REVIEW_TARGET_NUMERATOR,
      RECOMMENDED_DAILY_REVIEW_TARGET_DENOMINATOR,
      INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
    )
  );
}

function assertSingleAggregateQueryResult(result, errorMessage) {
  if (
    result === null
    || typeof result !== 'object'
    || !Array.isArray(result.rows)
    || result.rows.length !== 1
    || result.rowCount !== 1
  ) {
    throw new TypeError(errorMessage);
  }
}

function getRequiredSingleAggregateQueryRow(result, errorMessage) {
  assertSingleAggregateQueryResult(result, errorMessage);
  return result.rows[0];
}

function assertListQueryResult(result, errorMessage) {
  if (
    result === null
    || typeof result !== 'object'
    || !Array.isArray(result.rows)
    || !Number.isSafeInteger(result.rowCount)
    || result.rowCount < 0
    || result.rowCount !== result.rows.length
  ) {
    throw new TypeError(errorMessage);
  }
}

function assertBoundedListQueryResult(result, errorMessage, maxRows) {
  assertListQueryResult(result, errorMessage);

  if (
    !Number.isSafeInteger(maxRows)
    || maxRows < 0
    || result.rows.length > maxRows
  ) {
    throw new TypeError(errorMessage);
  }
}

function getOptionalSingleQueryRow(result, errorMessage) {
  if (
    result === null
    || typeof result !== 'object'
    || !Array.isArray(result.rows)
  ) {
    throw new TypeError(errorMessage);
  }

  if (result.rowCount === 0 && result.rows.length === 0) {
    return null;
  }

  // rowCount and rows.length must agree so malformed DB adapters cannot
  // downgrade duplicate or impossible returned rows into normal 404/409 paths.
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new TypeError(errorMessage);
  }

  return result.rows[0];
}

function getRequiredSingleQueryRow(result, errorMessage) {
  const row = getOptionalSingleQueryRow(result, errorMessage);
  if (row === null) {
    throw new TypeError(errorMessage);
  }

  return row;
}

function toCardMutationPayload(row) {
  return {
    id: row.id,
    deck_id: row.deck_id,
    front_content: row.front_content,
    back_content: row.back_content,
    next_review: row.next_review,
    interval: row.interval,
    ease_factor: row.ease_factor,
    review_count: row.review_count,
  };
}

function toCardReadPayload(row) {
  const card = {};

  for (const field of CARD_READ_FIELDS) {
    if (Object.hasOwn(row, field)) {
      card[field] = row[field];
    }
  }

  return card;
}

function toDeckReadPayload(row) {
  const deck = {};

  for (const field of DECK_READ_FIELDS) {
    if (Object.hasOwn(row, field)) {
      deck[field] = row[field];
    }
  }

  return deck;
}

function toDeckListPayload(row, options = {}) {
  assertDeckListResult(row, options);

  const totalCards = toDeckListAggregateCount(row.totalCards);
  const dueCards = toDeckListAggregateCount(row.dueCards);
  if (dueCards > totalCards) {
    throw new TypeError(INVALID_DECK_LIST_RESULT_ERROR);
  }

  return {
    ...toDeckReadPayload(row),
    totalCards,
    dueCards,
  };
}

function toStatsResponsePayload(row) {
  assertStatsResult(row);

  const payload = {};
  for (const field of STATS_RESPONSE_FIELDS) {
    payload[field] = toStatsAggregateCount(row[field]);
  }
  assertStatsCountInvariants(payload);

  return payload;
}

function toStudySessionResponseCardPayload(row) {
  const card = {};

  for (const field of STUDY_SESSION_RESPONSE_CARD_FIELDS) {
    if (Object.hasOwn(row, field)) {
      card[field] = row[field];
    }
  }

  return card;
}

function toDeleteCardResponseCardPayload(row) {
  const card = {};

  for (const field of DELETE_CARD_RESPONSE_CARD_FIELDS) {
    if (Object.hasOwn(row, field)) {
      card[field] = row[field];
    }
  }

  return card;
}

function validateBrowseCardsLimit(value) {
  if (value === undefined) {
    return { ok: true, value: BROWSE_CARDS_DEFAULT_LIMIT };
  }

  const validation = validatePositiveIntegerIdentifier(value, 'limit');
  if (!validation.ok || validation.value > BROWSE_CARDS_MAX_LIMIT) {
    return {
      ok: false,
      error: `Invalid limit: must be a positive integer no greater than ${BROWSE_CARDS_MAX_LIMIT}`,
    };
  }

  return validation;
}

function validateBrowseCardsSearch(value) {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid q: must be a string' };
  }

  const trimmed = value.trim();
  if (trimmed.length > BROWSE_CARDS_MAX_SEARCH_LENGTH) {
    return {
      ok: false,
      error: `Invalid q: must be ${BROWSE_CARDS_MAX_SEARCH_LENGTH} characters or fewer`,
    };
  }

  if (trimmed.includes('\u0000')) {
    return { ok: false, error: 'Invalid q: cannot contain null bytes' };
  }

  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

function validateDueCardsLimit(value) {
  if (value === undefined) {
    return { ok: true, value: DUE_CARDS_DEFAULT_LIMIT };
  }

  const validation = validatePositiveIntegerIdentifier(value, 'limit');
  if (!validation.ok || validation.value > BROWSE_CARDS_MAX_LIMIT) {
    return {
      ok: false,
      error: `Invalid limit: must be a positive integer no greater than ${BROWSE_CARDS_MAX_LIMIT}`,
    };
  }

  return validation;
}

function getRequestQueryObject(req) {
  const query = req?.query;
  return query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};
}

function getOwnRequestQueryValue(query, fieldName) {
  return Object.hasOwn(query, fieldName) ? query[fieldName] : undefined;
}

function getRequestParamsObject(req) {
  const params = req?.params;
  return params !== null && typeof params === 'object' && !Array.isArray(params) ? params : {};
}

function getOwnRequestParamValue(params, fieldName) {
  return Object.hasOwn(params, fieldName) ? params[fieldName] : undefined;
}

function getRequestBodyObject(req) {
  const body = req?.body;
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function getOwnRequestBodyValue(body, fieldName) {
  return Object.hasOwn(body, fieldName) ? body[fieldName] : undefined;
}

function validateBrowseCardsCursor(query = {}) {
  const hasBeforeCreatedAtParam = Object.hasOwn(query, 'beforeCreatedAt');
  const hasBeforeIdParam = Object.hasOwn(query, 'beforeId');
  const hasCursorCreatedAtParam = Object.hasOwn(query, 'cursorCreatedAt');
  const hasCursorIdParam = Object.hasOwn(query, 'cursorId');
  const hasBeforeFamily = hasBeforeCreatedAtParam || hasBeforeIdParam;
  const hasCursorFamily = hasCursorCreatedAtParam || hasCursorIdParam;
  const hasCompleteBeforeFamily = hasBeforeCreatedAtParam && hasBeforeIdParam;
  const hasCompleteCursorFamily = hasCursorCreatedAtParam && hasCursorIdParam;

  if (!hasBeforeFamily && !hasCursorFamily) {
    return { ok: true, value: null };
  }

  if (hasBeforeFamily && hasCursorFamily) {
    if (!hasCompleteBeforeFamily || !hasCompleteCursorFamily) {
      return {
        ok: false,
        error: 'Invalid cursor: use either beforeCreatedAt/beforeId or cursorCreatedAt/cursorId, not both',
      };
    }

    const beforeCreatedAt = query.beforeCreatedAt;
    const cursorCreatedAt = query.cursorCreatedAt;

    if (!isValidIsoTimestamp(beforeCreatedAt)) {
      return { ok: false, error: 'Invalid beforeCreatedAt: must be a valid date' };
    }

    if (!isValidIsoTimestamp(cursorCreatedAt)) {
      return { ok: false, error: 'Invalid cursorCreatedAt: must be a valid date' };
    }

    const beforeIdValidation = validatePositiveIntegerIdentifier(query.beforeId, 'beforeId');
    if (!beforeIdValidation.ok) {
      return { ok: false, error: beforeIdValidation.error };
    }

    const cursorIdValidation = validatePositiveIntegerIdentifier(query.cursorId, 'cursorId');
    if (!cursorIdValidation.ok) {
      return { ok: false, error: cursorIdValidation.error };
    }

    if (beforeCreatedAt !== cursorCreatedAt || beforeIdValidation.value !== cursorIdValidation.value) {
      return {
        ok: false,
        error: 'Invalid cursor: beforeCreatedAt/beforeId and cursorCreatedAt/cursorId must match when both are provided',
      };
    }

    return {
      ok: true,
      value: {
        cursorCreatedAt,
        cursorId: cursorIdValidation.value,
      },
    };
  }

  const createdAtField = hasCursorFamily ? 'cursorCreatedAt' : 'beforeCreatedAt';
  const idField = hasCursorFamily ? 'cursorId' : 'beforeId';
  const hasCreatedAt = hasCursorFamily ? hasCursorCreatedAtParam : hasBeforeCreatedAtParam;
  const hasId = hasCursorFamily ? hasCursorIdParam : hasBeforeIdParam;

  if (!hasCreatedAt || !hasId) {
    return { ok: false, error: 'Invalid cursor: created-at and id values must be provided together' };
  }

  const createdAt = query[createdAtField];
  const id = query[idField];

  if (!isValidIsoTimestamp(createdAt)) {
    return { ok: false, error: `Invalid ${createdAtField}: must be a valid date` };
  }

  const idValidation = validatePositiveIntegerIdentifier(id, idField);
  if (!idValidation.ok) {
    return { ok: false, error: idValidation.error };
  }

  return {
    ok: true,
    value: {
      cursorCreatedAt: createdAt,
      cursorId: idValidation.value,
    },
  };
}

// Stats and scheduling buckets intentionally use the Node process local timezone;
// keep Node TZ aligned with the database/session timezone for timestamp columns.
function startOfLocalDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addLocalDays(date, days) {
  const day = new Date(date);
  day.setDate(day.getDate() + days);
  return day;
}

function getSchedulingInsightDateBoundaries(now = new Date()) {
  // Preserve the previous app-local day bucketing for scheduling insights.
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addLocalDays(todayStart, 1);
  const afterTomorrowStart = addLocalDays(todayStart, 2);
  const sevenDayEndExclusive = addLocalDays(todayStart, 7);

  return {
    todayStart,
    tomorrowStart,
    afterTomorrowStart,
    sevenDayEndExclusive,
  };
}

function isDuplicateDeckNameError(error) {
  return (
    error?.code === '23505'
    && DUPLICATE_DECK_NAME_CONSTRAINTS.has(error.constraint)
  );
}

async function getDueCardsByDeck(req, res, db) {
  try {
    const routeParams = getRequestParamsObject(req);
    const deckIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestParamValue(routeParams, 'deckId'),
      'deckId'
    );
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const query = getRequestQueryObject(req);
    const limitValidation = validateDueCardsLimit(getOwnRequestQueryValue(query, 'limit'));
    if (!limitValidation.ok) {
      return res.status(400).json({ error: limitValidation.error });
    }

    const deckId = deckIdValidation.value;
    const userId = getAuthenticatedUserId(req);
    const params = [deckId, userId, limitValidation.value];

    const result = await db.query(
      `SELECT ${CARD_READ_SELECT_LIST},
              d.id AS "__owned_deck_id",
              d.user_id AS "__owned_user_id",
              -- Keep this proof expression coupled to the LEFT JOIN due predicate below.
              CASE
                WHEN c.id IS NULL THEN NULL
                ELSE ${getDueCardPredicate('c')}
              END AS "__is_due"
       FROM decks d
       LEFT JOIN cards c
         ON c.deck_id = d.id
        AND ${getDueCardPredicate('c')}
       WHERE d.id = $1 AND d.user_id = $2
       ORDER BY c.next_review ASC NULLS FIRST, c.id ASC
       LIMIT $3`,
      params
    );
    assertBoundedListQueryResult(
      result,
      INVALID_CARD_READ_RESULT_ERROR,
      limitValidation.value
    );
    const { rows } = result;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found for user' });
    }

    for (const row of rows) {
      assertDueCardListRow(row, deckId, { expectedUserId: userId });
    }

    const dueCards = rows
      .filter((row) => row.id !== null)
      .map((row) => {
        assertCardReadResult(row);
        return toCardReadPayload(row);
      });
    return res.json(dueCards);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getCardsByDeck(req, res, db) {
  try {
    const routeParams = getRequestParamsObject(req);
    const deckIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestParamValue(routeParams, 'deckId'),
      'deckId'
    );
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const query = getRequestQueryObject(req);
    const limitValidation = validateBrowseCardsLimit(getOwnRequestQueryValue(query, 'limit'));
    if (!limitValidation.ok) {
      return res.status(400).json({ error: limitValidation.error });
    }

    const cursorValidation = validateBrowseCardsCursor(query);
    if (!cursorValidation.ok) {
      return res.status(400).json({ error: cursorValidation.error });
    }

    const searchValidation = validateBrowseCardsSearch(getOwnRequestQueryValue(query, 'q'));
    if (!searchValidation.ok) {
      return res.status(400).json({ error: searchValidation.error });
    }

    const deckId = deckIdValidation.value;
    const userId = getAuthenticatedUserId(req);
    const params = [deckId, userId];
    let cursorClause = '';
    if (cursorValidation.value !== null) {
      const cursorCreatedAtPlaceholder = `$${params.length + 1}`;
      const cursorIdPlaceholder = `$${params.length + 2}`;
      // cards.created_at is a schema UTC wall-clock TIMESTAMP; normalize API
      // cursor instants here so raw offset strings cannot shift by DB session time zone.
      const cursorCreatedAtUtcExpression =
        `(${cursorCreatedAtPlaceholder}::timestamptz AT TIME ZONE 'UTC')`;
      params.push(cursorValidation.value.cursorCreatedAt, cursorValidation.value.cursorId);
      cursorClause = `
        AND (
          c.created_at < ${cursorCreatedAtUtcExpression}
          OR (c.created_at = ${cursorCreatedAtUtcExpression} AND c.id < ${cursorIdPlaceholder})
        )`;
    }

    let searchClause = '';
    if (searchValidation.value !== null) {
      params.push(searchValidation.value);
      const searchPlaceholder = `$${params.length}`;
      searchClause = `
        AND (
          POSITION(LOWER(${searchPlaceholder}) IN LOWER(c.front_content)) > 0
          OR POSITION(LOWER(${searchPlaceholder}) IN LOWER(c.back_content)) > 0
        )`;
    }

    const requestedRowLimit = limitValidation.value + 1;
    params.push(requestedRowLimit);
    const limitPlaceholder = `$${params.length}`;

    // Keep both cursor and search filters in the LEFT JOIN below. Moving them
    // to WHERE would null-drop the LEFT JOIN sentinel row and cause spurious
    // 404s for owned decks whose cards are filtered out.
    const result = await db.query(
      `SELECT ${CARD_READ_SELECT_LIST},
              to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "__cursor_created_at",
              d.id AS "__owned_deck_id",
              d.user_id AS "__owned_user_id"
       FROM decks d
       LEFT JOIN cards c
         ON c.deck_id = d.id${cursorClause}${searchClause}
       WHERE d.id = $1 AND d.user_id = $2
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ${limitPlaceholder}`,
      params
    );
    assertBoundedListQueryResult(
      result,
      INVALID_CARD_READ_RESULT_ERROR,
      requestedRowLimit
    );
    const { rows } = result;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found for user' });
    }

    for (const row of rows) {
      assertCardListRowAnchoredToDeck(row, deckId, { expectedUserId: userId });
    }

    const cardRows = rows.filter((row) => row.id !== null);
    const hasNextPage = cardRows.length > limitValidation.value;
    const pageRows = cardRows.slice(0, limitValidation.value);
    const cards = pageRows.map((row) => {
      assertCardReadResult(row);
      return toCardReadPayload(row);
    });

    const lastPageRow = pageRows.at(-1);
    let nextCursor = null;
    if (hasNextPage && lastPageRow) {
      assertCardBrowseCursorResult(lastPageRow);
      nextCursor = {
        cursorCreatedAt: lastPageRow.__cursor_created_at,
        cursorId: lastPageRow.id,
        beforeCreatedAt: lastPageRow.__cursor_created_at,
        beforeId: lastPageRow.id,
      };
    }

    return res.json({ cards, nextCursor });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createCard(req, res, db) {
  try {
    const body = getRequestBodyObject(req);
    const deckIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestBodyValue(body, 'deckId'),
      'deckId'
    );
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const frontContentValidation = validateCardContent(
      getOwnRequestBodyValue(body, 'frontContent'),
      'frontContent'
    );
    if (!frontContentValidation.ok) {
      return res.status(400).json({ error: frontContentValidation.error });
    }

    const backContentValidation = validateCardContent(
      getOwnRequestBodyValue(body, 'backContent'),
      'backContent'
    );
    if (!backContentValidation.ok) {
      return res.status(400).json({ error: backContentValidation.error });
    }

    const userId = getAuthenticatedUserId(req);
    const result = await db.query(
      `WITH inserted AS (
         INSERT INTO cards (
           deck_id,
           front_content,
           back_content,
           next_review,
           interval,
           ease_factor,
           review_count
         )
         SELECT d.id,
                $3,
                $4,
                ${CREATE_CARD_NEXT_REVIEW_SQL_EXPRESSION},
                ${CREATE_CARD_INITIAL_INTERVAL},
                ${CREATE_CARD_INITIAL_EASE_FACTOR},
                ${CREATE_CARD_INITIAL_REVIEW_COUNT}
         FROM decks d
         WHERE d.id = $1 AND d.user_id = $2
         RETURNING id,
                   deck_id,
                   front_content,
                   back_content,
                   next_review,
                   interval,
                   ease_factor,
                   review_count
       )
       SELECT i.id,
              i.deck_id,
              i.front_content,
              i.back_content,
              i.next_review,
              i.interval,
              i.ease_factor,
              i.review_count,
              d.user_id AS "__owned_user_id",
              d.id AS "__owned_deck_id"
       FROM inserted i
       JOIN decks d ON d.id = i.deck_id`,
      [
        deckIdValidation.value,
        userId,
        frontContentValidation.value,
        backContentValidation.value,
      ]
    );

    const createdCard = getOptionalSingleQueryRow(result, INVALID_CARD_MUTATION_RESULT_ERROR);
    if (createdCard === null) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    assertCardMutationResult(createdCard, {
      expectedDeckId: deckIdValidation.value,
      expectedUserId: userId,
      requireDeckOwnershipProof: true,
      // INSERT uses server-side NOW(), so require a valid timestamp without
      // comparing it to a process-local fixed value.
      requireNextReview: CREATE_CARD_REQUIRE_NEXT_REVIEW,
      expectedInterval: CREATE_CARD_INITIAL_INTERVAL,
      expectedEaseFactor: CREATE_CARD_INITIAL_EASE_FACTOR,
      expectedReviewCount: CREATE_CARD_INITIAL_REVIEW_COUNT,
    });
    return res.status(201).json(toCardMutationPayload(createdCard));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateCard(req, res, db) {
  try {
    const routeParams = getRequestParamsObject(req);
    const cardIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestParamValue(routeParams, 'cardId'),
      'cardId'
    );
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const body = getRequestBodyObject(req);
    const frontContentValidation = validateCardContent(
      getOwnRequestBodyValue(body, 'frontContent'),
      'frontContent'
    );
    if (!frontContentValidation.ok) {
      return res.status(400).json({ error: frontContentValidation.error });
    }

    const backContentValidation = validateCardContent(
      getOwnRequestBodyValue(body, 'backContent'),
      'backContent'
    );
    if (!backContentValidation.ok) {
      return res.status(400).json({ error: backContentValidation.error });
    }

    const userId = getAuthenticatedUserId(req);
    const result = await db.query(
      `UPDATE cards
       SET front_content = $3,
           back_content = $4
       FROM decks d
       WHERE cards.id = $1
         AND d.id = cards.deck_id
         AND d.user_id = $2
       RETURNING cards.id,
                 cards.deck_id,
                 cards.front_content,
                 cards.back_content,
                 cards.next_review,
                 cards.interval,
                 cards.ease_factor,
                 cards.review_count,
                 d.user_id AS "__owned_user_id",
                 d.id AS "__owned_deck_id"`,
      [
        cardIdValidation.value,
        userId,
        frontContentValidation.value,
        backContentValidation.value,
      ]
    );

    const updatedCard = getOptionalSingleQueryRow(result, INVALID_CARD_MUTATION_RESULT_ERROR);
    if (updatedCard === null) {
      return res.status(404).json({ error: 'Card not found' });
    }

    assertCardMutationResult(updatedCard, {
      expectedCardId: cardIdValidation.value,
      expectedUserId: userId,
      requireDeckOwnershipProof: true,
    });
    return res.json(toCardMutationPayload(updatedCard));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteCard(req, res, db) {
  try {
    const routeParams = getRequestParamsObject(req);
    const cardIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestParamValue(routeParams, 'cardId'),
      'cardId'
    );
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const userId = getAuthenticatedUserId(req);
    const deleteResult = await db.query(
      `DELETE FROM cards
       USING decks d
       WHERE cards.id = $1
         AND d.id = cards.deck_id
         AND d.user_id = $2
       RETURNING cards.id,
                 cards.deck_id,
                 cards.front_content,
                 cards.back_content,
                 cards.next_review,
                 d.user_id AS "__owned_user_id",
                 d.id AS "__owned_deck_id"`,
      [cardIdValidation.value, userId]
    );

    const deletedCard = getOptionalSingleQueryRow(deleteResult, INVALID_CARD_REMOVAL_RESULT_ERROR);
    if (deletedCard === null) {
      return res.status(404).json({ error: 'Card not found' });
    }

    assertCardRemovalResult(deletedCard, {
      expectedCardId: cardIdValidation.value,
      expectedUserId: userId,
      requireDeckOwnershipProof: true,
    });
    return res.json({
      success: true,
      card: toDeleteCardResponseCardPayload(deletedCard),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function submitStudySession(req, res, db, calculateNextReview) {
  let client = db;
  let shouldReleaseClient = false;
  let transactionStarted = false;

  try {
    const rollbackTransaction = async () => {
      if (transactionStarted) {
        await client.query('ROLLBACK');
        transactionStarted = false;
      }
    };

    const body = getRequestBodyObject(req);
    const cardIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestBodyValue(body, 'cardId'),
      'cardId'
    );
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const validCardId = cardIdValidation.value;
    const quality = getOwnRequestBodyValue(body, 'quality');
    if (!isValidQuality(quality)) {
      return res.status(400).json({ error: 'Invalid quality: must be an integer between 0 and 5' });
    }

    const userId = getAuthenticatedUserId(req);
    if (typeof db.connect === 'function') {
      client = await db.connect();
      shouldReleaseClient = true;
      await client.query('BEGIN');
      transactionStarted = true;
    }

    const cardResult = await client.query(
      `SELECT ${CARD_READ_SELECT_LIST},
              d.user_id AS "__owned_user_id",
              ${getDueCardPredicate('c')} AS "__is_due"
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1
         AND d.user_id = $2
       FOR UPDATE OF c`,
      [validCardId, userId]
    );
    const card = getOptionalSingleQueryRow(cardResult, INVALID_STUDY_SESSION_CARD_READ_RESULT_ERROR);
    if (card === null) {
      await rollbackTransaction();
      return res.status(404).json({ error: 'Card not found' });
    }

    assertStudySessionCardReadResult(card, validCardId, userId);
    if (card.__is_due === false) {
      await rollbackTransaction();
      return res.status(409).json({ error: 'Card is not due' });
    }

    const reviewedAt = new Date();
    const schedule = calculateNextReview(card, quality, reviewedAt);
    assertValidSchedulingUpdate(schedule);
    const { ease_factor, interval, next_review } = schedule;

    // CTE contract: no row -> missing/unowned 404; updated row -> success; target-only sentinel -> owned but no longer due 409.
    const updateResult = await client.query(
      `WITH target AS (
         SELECT c.id,
                d.user_id AS "__owned_user_id"
         FROM cards c
         JOIN decks d ON d.id = c.deck_id
         WHERE c.id = $5
           AND d.user_id = $6
         FOR UPDATE OF c
       ),
       updated AS (
         UPDATE cards
         SET last_reviewed = $1,
             next_review = $2,
             interval = $3,
             ease_factor = $4,
             review_count = COALESCE(review_count, 0) + 1
         FROM target
         WHERE cards.id = $5
           AND target.id = cards.id
           AND ${getDueCardPredicate('cards')}
         RETURNING cards.id,
                   cards.next_review,
                   cards.interval,
                   cards.ease_factor,
                   cards.review_count,
                   cards.last_reviewed,
                   target.__owned_user_id,
                   TRUE AS "__updated"
       )
       SELECT id,
              next_review,
              interval,
              ease_factor,
              review_count,
              last_reviewed,
              "__owned_user_id",
              "__updated"
       FROM updated
       UNION ALL
       SELECT NULL AS id,
              NULL AS next_review,
              NULL AS interval,
              NULL AS ease_factor,
              NULL AS review_count,
              NULL AS last_reviewed,
              target.__owned_user_id AS "__owned_user_id",
              FALSE AS "__updated"
       FROM target
       WHERE NOT EXISTS (SELECT 1 FROM updated)`,
      [reviewedAt, next_review, interval, ease_factor, validCardId, userId]
    );
    const updatedCard = getOptionalSingleQueryRow(updateResult, INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR);
    if (updatedCard === null) {
      await rollbackTransaction();
      return res.status(404).json({ error: 'Card not found' });
    }

    assertStudySessionUpdateControlResult(updatedCard, userId);
    if (updatedCard?.__updated === false) {
      assertStudySessionUpdateConflict(updatedCard, userId);
      await rollbackTransaction();
      return res.status(409).json({ error: 'Card is not due' });
    }

    assertStudySessionUpdateSucceeded(updatedCard, validCardId, userId, schedule);
    const responseCard = toStudySessionResponseCardPayload(updatedCard);
    if (transactionStarted) {
      await client.query('COMMIT');
      transactionStarted = false;
    }
    return res.json({ success: true, card: responseCard });
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error(rollbackErr);
      }
      transactionStarted = false;
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (shouldReleaseClient) {
      try {
        await client.release();
      } catch (releaseErr) {
        console.error(releaseErr);
      }
    }
  }
}

async function createDeck(req, res, db) {
  try {
    const body = getRequestBodyObject(req);
    const validationResult = validateDeckName(getOwnRequestBodyValue(body, 'name'));
    if (!validationResult.ok) {
      return res.status(400).json({ error: validationResult.error });
    }

    const deckName = validationResult.value;
    const userId = getAuthenticatedUserId(req);
    const result = await db.query(
      `INSERT INTO decks (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, (LOWER(TRIM(name)))) DO NOTHING
       RETURNING id,
                 user_id,
                 name,
                 description,
                 created_at`,
      [userId, deckName]
    );

    const createdDeck = getOptionalSingleQueryRow(result, INVALID_DECK_MUTATION_RESULT_ERROR);
    if (createdDeck === null) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    assertDeckMutationResult(createdDeck, { expectedUserId: userId });
    return res.status(201).json(toDeckReadPayload(createdDeck));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function renameDeck(req, res, db) {
  try {
    const routeParams = getRequestParamsObject(req);
    const deckIdValidation = validatePositiveIntegerIdentifier(
      getOwnRequestParamValue(routeParams, 'deckId'),
      'deckId'
    );
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const body = getRequestBodyObject(req);
    const validationResult = validateDeckName(getOwnRequestBodyValue(body, 'name'));
    if (!validationResult.ok) {
      return res.status(400).json({ error: validationResult.error });
    }

    const deckId = deckIdValidation.value;
    const deckName = validationResult.value;
    const userId = getAuthenticatedUserId(req);
    const queryResult = await db.query(
      `WITH target AS (
         SELECT id
         FROM decks
         WHERE id = $1 AND user_id = $2
       ),
       duplicate AS (
         SELECT id
         FROM decks
         WHERE user_id = $2
           AND id <> $1
           AND LOWER(TRIM(name)) = LOWER(TRIM($3))
         LIMIT 1
       ),
       updated AS (
         UPDATE decks d
         SET name = $3
         FROM target
         WHERE d.id = target.id
           AND NOT EXISTS (SELECT 1 FROM duplicate)
         RETURNING d.id,
                   d.user_id,
                   d.name,
                   d.description,
                   d.created_at
       )
       SELECT
         EXISTS (SELECT 1 FROM target) AS "deckExists",
         EXISTS (SELECT 1 FROM duplicate) AS "duplicateExists",
         (SELECT row_to_json(deck_payload)
          FROM (
            SELECT updated.id,
                   updated.user_id,
                   updated.name,
                   updated.description,
                   to_char((updated.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
            FROM updated
          ) deck_payload) AS deck`,
      [deckId, userId, deckName]
    );

    const result = getRequiredSingleQueryRow(queryResult, INVALID_DECK_RENAME_CONTROL_RESULT_ERROR);
    assertDeckRenameControlResult(result, {
      expectedDeckId: deckId,
      expectedUserId: userId,
    });
    if (!result.deckExists) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    if (result.duplicateExists) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    return res.json(toDeckReadPayload(result.deck));
  } catch (err) {
    if (isDuplicateDeckNameError(err)) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDecks(req, res, db) {
  try {
    const userId = getAuthenticatedUserId(req);
    const result = await db.query(
      `SELECT ${DECK_READ_SELECT_LIST},
         COUNT(c.id) AS "totalCards",
         COUNT(c.id) FILTER (WHERE ${getDueCardPredicate('c')}) AS "dueCards"
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC, d.id DESC`,
      [userId]
    );

    assertListQueryResult(result, INVALID_DECK_LIST_RESULT_ERROR);
    return res.json(result.rows.map((row) => toDeckListPayload(row, {
      expectedUserId: userId,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteDeck(req, res, db) {
  const routeParams = getRequestParamsObject(req);
  const deckIdValidation = validatePositiveIntegerIdentifier(
    getOwnRequestParamValue(routeParams, 'deckId'),
    'deckId'
  );
  if (!deckIdValidation.ok) {
    return res.status(400).json({ error: deckIdValidation.error });
  }

  const deckId = deckIdValidation.value;

  try {
    const userId = getAuthenticatedUserId(req);
    const deleteResult = await db.query(
      `WITH target AS (
         SELECT id
         FROM decks
         WHERE id = $1 AND user_id = $2
       ),
       deleted_cards AS (
         DELETE FROM cards c
         USING target
         WHERE c.deck_id = target.id
         RETURNING c.deck_id
       ),
       deleted_deck AS (
         DELETE FROM decks d
         USING target
         WHERE d.id = target.id
           AND (SELECT COUNT(*) FROM deleted_cards) >= 0
         RETURNING d.id,
                   d.user_id
       )
       SELECT id,
              user_id
       FROM deleted_deck`,
      [deckId, userId]
    );

    const deletedDeck = getOptionalSingleQueryRow(deleteResult, INVALID_DECK_REMOVAL_RESULT_ERROR);
    if (deletedDeck === null) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    assertDeckRemovalResult(deletedDeck, {
      expectedDeckId: deckId,
      expectedUserId: userId,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getStats(req, res, db, now = new Date()) {
  try {
    const userId = getAuthenticatedUserId(req);
    const todayStart = startOfLocalDay(now);
    const tomorrowStart = addLocalDays(todayStart, 1);
    const sevenDayLookbackStart = addLocalDays(todayStart, -7);
    const thirtyDayLookbackStart = addLocalDays(todayStart, -30);

    const result = await db.query(
      `SELECT
         COUNT(c.id) AS "totalCards",
         COUNT(DISTINCT d.id) AS "totalDecks",
         COUNT(c.id) FILTER (
           WHERE c.last_reviewed >= $2
             AND c.last_reviewed < $3
         ) AS "todayReviews",
         COUNT(c.id) FILTER (
           WHERE c.last_reviewed >= $4
             AND c.last_reviewed < $3
         ) AS "weekReviews",
         COUNT(c.id) FILTER (
           WHERE c.last_reviewed >= $5
             AND c.last_reviewed < $3
         ) AS "monthReviews"
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = $1`,
      [userId, todayStart, tomorrowStart, sevenDayLookbackStart, thirtyDayLookbackStart]
    );

    const stats = getRequiredSingleAggregateQueryRow(result, INVALID_STATS_RESULT_ERROR);
    return res.json(toStatsResponsePayload(stats));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSchedulingInsights(req, res, db, now = new Date()) {
  try {
    const userId = getAuthenticatedUserId(req);
    const {
      todayStart,
      tomorrowStart,
      afterTomorrowStart,
      sevenDayEndExclusive,
    } = getSchedulingInsightDateBoundaries(now);

    const result = await db.query(
      `SELECT
         COUNT(c.id) AS "totalCards",
         COUNT(c.id) FILTER (
           WHERE c.next_review IS NOT NULL
             AND c.next_review < $2
         ) AS "overdue",
         COUNT(c.id) FILTER (
           WHERE c.next_review IS NULL
              OR (
                c.next_review >= $2
                AND c.next_review < $3
              )
         ) AS "dueToday",
         COUNT(c.id) FILTER (
           WHERE c.next_review >= $3
             AND c.next_review < $4
         ) AS "dueTomorrow",
         COUNT(c.id) FILTER (
           WHERE c.next_review IS NULL
              OR (
                c.next_review >= $2
                AND c.next_review < $5
              )
         ) AS "dueNext7Days",
         COUNT(c.id) FILTER (
           WHERE c.ease_factor > 0
             AND c.ease_factor <= 1.6
             AND COALESCE(c.review_count, 0) >= 5
         ) AS "leechCandidates",
         ROUND((AVG(c.ease_factor) FILTER (WHERE c.ease_factor > 0))::numeric, 2) AS "averageEaseFactor"
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = $1`,
      [userId, todayStart, tomorrowStart, afterTomorrowStart, sevenDayEndExclusive]
    );

    const stats = getRequiredSingleAggregateQueryRow(
      result,
      INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
    );
    assertSchedulingInsightsResult(stats);

    const counts = {};
    for (const field of SCHEDULING_INSIGHTS_COUNT_FIELDS) {
      counts[field] = toSafeAggregateCount(
        stats[field],
        INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
      );
    }
    assertSchedulingInsightsCountInvariants(counts);

    const overdue = counts.overdue;
    const dueToday = counts.dueToday;
    const focusLoad = overdue + dueToday;
    const averageEaseFactor = toRequiredNullableAverageEaseFactor(
      stats.averageEaseFactor,
      INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
    );

    return res.json({
      totalCards: counts.totalCards,
      overdue,
      dueToday,
      dueTomorrow: counts.dueTomorrow,
      dueNext7Days: counts.dueNext7Days,
      leechCandidates: counts.leechCandidates,
      averageEaseFactor,
      recommendedDailyReviewTarget: toRecommendedDailyReviewTarget(focusLoad),
      suggestedNewCards: Math.max(0, 20 - focusLoad),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getCardsByDeck,
  createCard,
  updateCard,
  createDeck,
  deleteCard,
  deleteDeck,
  getDecks,
  getStats,
  getSchedulingInsights,
  getDueCardsByDeck,
  renameDeck,
  submitStudySession,
  isValidQuality,
  validatePositiveIntegerIdentifier,
};
