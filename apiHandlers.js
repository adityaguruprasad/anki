const { validateDeckName } = require('./deckNameValidation');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');
const { MAX_INTERVAL_DAYS, MIN_EASE_FACTOR } = require('./spacedRepetition');

const BROWSE_CARDS_DEFAULT_LIMIT = 50;
const BROWSE_CARDS_MAX_LIMIT = 100;
// Match the max due-card fetch window so omitted limits stay bounded without
// changing the explicit limit contract.
const DUE_CARDS_DEFAULT_LIMIT = BROWSE_CARDS_MAX_LIMIT;
const BROWSE_CARDS_MAX_SEARCH_LENGTH = 200;
const MAX_CARD_CONTENT_LENGTH = 10000;
// anki.db uses PostgreSQL SERIAL/INTEGER ids; reject impossible ids before
// they reach hot API queries where PostgreSQL would raise int4 range errors.
const MAX_POSTGRES_SERIAL_ID = 2147483647;
const MAX_POSTGRES_SERIAL_ID_TEXT = String(MAX_POSTGRES_SERIAL_ID);
const MAX_SAFE_INTEGER_TEXT = String(Number.MAX_SAFE_INTEGER);
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const AGGREGATE_DECIMAL_TEXT_PATTERN = /^\d+(?:\.\d+)?$/;
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
const INVALID_SCHEDULER_OUTPUT_ERROR = 'Invalid scheduler output';
const INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR = 'Invalid study-session update result';
const INVALID_CARD_MUTATION_RESULT_ERROR = 'Invalid card mutation result';
const INVALID_CARD_REMOVAL_RESULT_ERROR = 'Invalid card removal result';
const INVALID_CARD_READ_RESULT_ERROR = 'Invalid card read result';
const INVALID_DECK_LIST_RESULT_ERROR = 'Invalid deck-list result';
const INVALID_DECK_MUTATION_RESULT_ERROR = 'Invalid deck mutation result';
const INVALID_CARD_BROWSE_CURSOR_RESULT_ERROR = 'Invalid card browse cursor result';
const INVALID_STATS_RESULT_ERROR = 'Invalid stats result';
const INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR = 'Invalid scheduling-insights result';

function isValidQuality(quality) {
  return Number.isInteger(quality) && quality >= 0 && quality <= 5;
}

function isValidSchedulerNextReview(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  return isValidIsoTimestamp(value);
}

function assertValidSchedulingUpdate(schedule) {
  if (schedule === null || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new TypeError(INVALID_SCHEDULER_OUTPUT_ERROR);
  }

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

function assertStudySessionUpdateSucceeded(row) {
  assertObjectHasOwnFields(
    row,
    [...STUDY_SESSION_RESPONSE_CARD_FIELDS, '__updated'],
    INVALID_STUDY_SESSION_UPDATE_RESULT_ERROR
  );

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  if (
    row.__updated !== true
    || !cardIdValidation.ok
    || !isValidRequiredDatabaseTimestamp(row.next_review)
    || !isValidPersistedCardInterval(row.interval)
    || !isValidPersistedEaseFactor(row.ease_factor)
    || !isValidPersistedReviewCount(row.review_count)
    || !isValidRequiredDatabaseTimestamp(row.last_reviewed)
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

function toRequiredNullablePositiveAggregateNumber(value, errorMessage) {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0) {
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
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }

  throw new TypeError(errorMessage);
}

function getDueCardPredicate(tableAlias = 'c') {
  return `(${tableAlias}.next_review IS NULL OR ${tableAlias}.next_review <= NOW())`;
}

function validateCardContent(value, fieldName) {
  if (typeof value !== 'string') {
    return { ok: false, error: `Invalid ${fieldName}: must be a non-empty string` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `Invalid ${fieldName}: must be a non-empty string` };
  }

  if (trimmed.includes('\u0000')) {
    return { ok: false, error: `Invalid ${fieldName}: cannot contain null bytes` };
  }

  if (trimmed.length > MAX_CARD_CONTENT_LENGTH) {
    return { ok: false, error: `Invalid ${fieldName}: must be ${MAX_CARD_CONTENT_LENGTH} characters or fewer` };
  }

  return { ok: true, value: trimmed };
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

function assertCardMutationResult(row) {
  assertObjectHasOwnFields(row, CARD_MUTATION_RESPONSE_CARD_FIELDS, INVALID_CARD_MUTATION_RESULT_ERROR);

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  const deckIdValidation = validatePositiveIntegerIdentifier(row.deck_id, 'deckId');
  if (
    !cardIdValidation.ok
    || !deckIdValidation.ok
    || !isValidPersistedCardContent(row.front_content)
    || !isValidPersistedCardContent(row.back_content)
    || !isValidDatabaseTimestamp(row.next_review)
    || !isValidPersistedCardInterval(row.interval)
    || !isValidPersistedEaseFactor(row.ease_factor)
    || !isValidPersistedReviewCount(row.review_count)
  ) {
    throw new TypeError(INVALID_CARD_MUTATION_RESULT_ERROR);
  }
}

function assertCardRemovalResult(row) {
  assertObjectHasOwnFields(row, DELETE_CARD_RESPONSE_CARD_FIELDS, INVALID_CARD_REMOVAL_RESULT_ERROR);

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  if (
    !cardIdValidation.ok
    || !isValidPersistedCardContent(row.front_content)
    || !isValidPersistedCardContent(row.back_content)
    || !isValidDatabaseTimestamp(row.next_review)
  ) {
    throw new TypeError(INVALID_CARD_REMOVAL_RESULT_ERROR);
  }
}

function assertCardReadResult(row) {
  assertObjectHasOwnFields(
    row,
    CARD_READ_FIELDS,
    INVALID_CARD_READ_RESULT_ERROR
  );

  const cardIdValidation = validatePositiveIntegerIdentifier(row.id, 'cardId');
  const deckIdValidation = validatePositiveIntegerIdentifier(row.deck_id, 'deckId');
  if (
    !cardIdValidation.ok
    || !deckIdValidation.ok
    || !isValidPersistedCardContent(row.front_content)
    || !isValidPersistedCardContent(row.back_content)
  ) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  const timestampFields = ['created_at', 'last_reviewed', 'next_review'];
  for (const fieldName of timestampFields) {
    if (!isValidDatabaseTimestamp(row[fieldName])) {
      throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
    }
  }

  if (!isValidPersistedCardInterval(row.interval)) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  if (!isValidPersistedEaseFactor(row.ease_factor)) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }

  if (!isValidPersistedReviewCount(row.review_count)) {
    throw new TypeError(INVALID_CARD_READ_RESULT_ERROR);
  }
}

function assertDeckMutationResult(row) {
  assertObjectHasOwnFields(row, DECK_READ_FIELDS, INVALID_DECK_MUTATION_RESULT_ERROR);

  const deckIdValidation = validatePositiveIntegerIdentifier(row.id, 'deckId');
  if (!deckIdValidation.ok || typeof row.name !== 'string' || row.name.trim() === '') {
    throw new TypeError(INVALID_DECK_MUTATION_RESULT_ERROR);
  }
}

function assertDeckListResult(row) {
  assertObjectHasOwnFields(
    row,
    ['id', 'name', 'totalCards', 'dueCards'],
    INVALID_DECK_LIST_RESULT_ERROR
  );

  const deckIdValidation = validatePositiveIntegerIdentifier(row.id, 'deckId');
  if (!deckIdValidation.ok || typeof row.name !== 'string' || row.name.trim() === '') {
    throw new TypeError(INVALID_DECK_LIST_RESULT_ERROR);
  }
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

function assertStatsResult(row) {
  assertObjectHasOwnFields(row, STATS_RESPONSE_FIELDS, INVALID_STATS_RESULT_ERROR);
}

function assertSchedulingInsightsResult(row) {
  assertObjectHasOwnFields(
    row,
    SCHEDULING_INSIGHTS_RESPONSE_FIELDS,
    INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
  );
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

function toDeckListPayload(row) {
  assertDeckListResult(row);

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

async function getDueCardsByDeck(req, res, db) {
  try {
    const deckIdValidation = validatePositiveIntegerIdentifier(req.params?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const limitValidation = validateDueCardsLimit(req.query?.limit);
    if (!limitValidation.ok) {
      return res.status(400).json({ error: limitValidation.error });
    }

    const deckId = deckIdValidation.value;
    const params = [deckId, req.user.userId, limitValidation.value];

    const { rows } = await db.query(
      `SELECT ${CARD_READ_SELECT_LIST},
              d.id AS "__owned_deck_id"
       FROM decks d
       LEFT JOIN cards c
         ON c.deck_id = d.id
        AND ${getDueCardPredicate('c')}
       WHERE d.id = $1 AND d.user_id = $2
       ORDER BY c.next_review ASC NULLS FIRST, c.id ASC
       LIMIT $3`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found for user' });
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
    const deckIdValidation = validatePositiveIntegerIdentifier(req.params?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const limitValidation = validateBrowseCardsLimit(req.query?.limit);
    if (!limitValidation.ok) {
      return res.status(400).json({ error: limitValidation.error });
    }

    const cursorValidation = validateBrowseCardsCursor(req.query);
    if (!cursorValidation.ok) {
      return res.status(400).json({ error: cursorValidation.error });
    }

    const searchValidation = validateBrowseCardsSearch(req.query?.q);
    if (!searchValidation.ok) {
      return res.status(400).json({ error: searchValidation.error });
    }

    const params = [deckIdValidation.value, req.user.userId];
    let cursorClause = '';
    if (cursorValidation.value !== null) {
      params.push(cursorValidation.value.cursorCreatedAt, cursorValidation.value.cursorId);
      cursorClause = `
        AND (
          c.created_at < $3
          OR (c.created_at = $3 AND c.id < $4)
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

    params.push(limitValidation.value + 1);
    const limitPlaceholder = `$${params.length}`;

    const { rows } = await db.query(
      `SELECT ${CARD_READ_SELECT_LIST},
              to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "__cursor_created_at",
              d.id AS "__owned_deck_id"
       FROM decks d
       LEFT JOIN cards c
         ON c.deck_id = d.id${cursorClause}${searchClause}
       WHERE d.id = $1 AND d.user_id = $2
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ${limitPlaceholder}`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found for user' });
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
    const deckIdValidation = validatePositiveIntegerIdentifier(req.body?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const frontContentValidation = validateCardContent(req.body?.frontContent, 'frontContent');
    if (!frontContentValidation.ok) {
      return res.status(400).json({ error: frontContentValidation.error });
    }

    const backContentValidation = validateCardContent(req.body?.backContent, 'backContent');
    if (!backContentValidation.ok) {
      return res.status(400).json({ error: backContentValidation.error });
    }

    const { rows } = await db.query(
      `INSERT INTO cards (
         deck_id,
         front_content,
         back_content,
         next_review,
         interval,
         ease_factor,
         review_count
       )
       SELECT d.id, $3, $4, NOW(), 1, 2.5, 0
       FROM decks d
       WHERE d.id = $1 AND d.user_id = $2
       RETURNING id,
                 deck_id,
                 front_content,
                 back_content,
                 next_review,
                 interval,
                 ease_factor,
                 review_count`,
      [
        deckIdValidation.value,
        req.user.userId,
        frontContentValidation.value,
        backContentValidation.value,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    const createdCard = rows[0];
    assertCardMutationResult(createdCard);
    return res.status(201).json(toCardMutationPayload(createdCard));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateCard(req, res, db) {
  try {
    const cardIdValidation = validatePositiveIntegerIdentifier(req.params?.cardId, 'cardId');
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const frontContentValidation = validateCardContent(req.body?.frontContent, 'frontContent');
    if (!frontContentValidation.ok) {
      return res.status(400).json({ error: frontContentValidation.error });
    }

    const backContentValidation = validateCardContent(req.body?.backContent, 'backContent');
    if (!backContentValidation.ok) {
      return res.status(400).json({ error: backContentValidation.error });
    }

    const { rows } = await db.query(
      `UPDATE cards
       SET front_content = $3,
           back_content = $4
       WHERE id = $1
         AND EXISTS (
           SELECT 1
           FROM decks d
           WHERE d.id = cards.deck_id
             AND d.user_id = $2
         )
       RETURNING id,
                 deck_id,
                 front_content,
                 back_content,
                 next_review,
                 interval,
                 ease_factor,
                 review_count`,
      [
        cardIdValidation.value,
        req.user.userId,
        frontContentValidation.value,
        backContentValidation.value,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const updatedCard = rows[0];
    assertCardMutationResult(updatedCard);
    return res.json(toCardMutationPayload(updatedCard));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteCard(req, res, db) {
  try {
    const cardIdValidation = validatePositiveIntegerIdentifier(req.params?.cardId, 'cardId');
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const deleteResult = await db.query(
      `DELETE FROM cards
       WHERE id = $1
         AND EXISTS (
           SELECT 1
           FROM decks d
           WHERE d.id = cards.deck_id
             AND d.user_id = $2
         )
       RETURNING id,
                 front_content,
                 back_content,
                 next_review`,
      [cardIdValidation.value, req.user.userId]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const deletedCard = deleteResult.rows[0];
    assertCardRemovalResult(deletedCard);
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

    const { cardId, quality } = req.body ?? {};
    const cardIdValidation = validatePositiveIntegerIdentifier(cardId, 'cardId');
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const validCardId = cardIdValidation.value;
    if (!isValidQuality(quality)) {
      return res.status(400).json({ error: 'Invalid quality: must be an integer between 0 and 5' });
    }

    if (typeof db.connect === 'function') {
      client = await db.connect();
      shouldReleaseClient = true;
      await client.query('BEGIN');
      transactionStarted = true;
    }

    const cardResult = await client.query(
      `SELECT ${CARD_READ_SELECT_LIST},
              ${getDueCardPredicate('c')} AS "__is_due"
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1
         AND d.user_id = $2
       FOR UPDATE OF c`,
      [validCardId, req.user.userId]
    );
    if (cardResult.rowCount === 0) {
      await rollbackTransaction();
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = cardResult.rows[0];
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
         SELECT c.id
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
         WHERE id = $5
           AND EXISTS (
             SELECT 1
             FROM target
             WHERE target.id = cards.id
           )
           AND ${getDueCardPredicate('cards')}
         RETURNING id,
                   next_review,
                   interval,
                   ease_factor,
                   review_count,
                   last_reviewed,
                   TRUE AS "__updated"
       )
       SELECT id,
              next_review,
              interval,
              ease_factor,
              review_count,
              last_reviewed,
              "__updated"
       FROM updated
       UNION ALL
       SELECT NULL AS id,
              NULL AS next_review,
              NULL AS interval,
              NULL AS ease_factor,
              NULL AS review_count,
              NULL AS last_reviewed,
              FALSE AS "__updated"
       FROM target
       WHERE NOT EXISTS (SELECT 1 FROM updated)`,
      [reviewedAt, next_review, interval, ease_factor, validCardId, req.user.userId]
    );
    if (updateResult.rowCount === 0) {
      await rollbackTransaction();
      return res.status(404).json({ error: 'Card not found' });
    }

    const updatedCard = updateResult.rows[0];
    if (updatedCard?.__updated === false) {
      await rollbackTransaction();
      return res.status(409).json({ error: 'Card is not due' });
    }

    assertStudySessionUpdateSucceeded(updatedCard);
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
    const validationResult = validateDeckName(req.body?.name);
    if (!validationResult.ok) {
      return res.status(400).json({ error: validationResult.error });
    }

    const deckName = validationResult.value;
    const { rows } = await db.query(
      `INSERT INTO decks (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, (LOWER(TRIM(name)))) DO NOTHING
       RETURNING id,
                 user_id,
                 name,
                 description,
                 created_at`,
      [req.user.userId, deckName]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    const createdDeck = rows[0];
    assertDeckMutationResult(createdDeck);
    return res.status(201).json(toDeckReadPayload(createdDeck));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function renameDeck(req, res, db) {
  try {
    const deckIdValidation = validatePositiveIntegerIdentifier(req.params?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const validationResult = validateDeckName(req.body?.name);
    if (!validationResult.ok) {
      return res.status(400).json({ error: validationResult.error });
    }

    const deckId = deckIdValidation.value;
    const deckName = validationResult.value;
    const { rows } = await db.query(
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
         (SELECT row_to_json(updated) FROM updated) AS deck`,
      [deckId, req.user.userId, deckName]
    );

    const result = rows[0] ?? {};
    if (!result.deckExists) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    if (result.duplicateExists) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    assertDeckMutationResult(result.deck);
    return res.json(toDeckReadPayload(result.deck));
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDecks(req, res, db) {
  try {
    const { rows } = await db.query(
      `SELECT ${DECK_READ_SELECT_LIST},
         COUNT(c.id) AS "totalCards",
         COUNT(c.id) FILTER (WHERE ${getDueCardPredicate('c')}) AS "dueCards"
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC, d.id DESC`,
      [req.user.userId]
    );

    return res.json(rows.map(toDeckListPayload));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteDeck(req, res, db) {
  const deckIdValidation = validatePositiveIntegerIdentifier(req.params?.deckId, 'deckId');
  if (!deckIdValidation.ok) {
    return res.status(400).json({ error: deckIdValidation.error });
  }

  const deckId = deckIdValidation.value;

  try {
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
         RETURNING d.id
       )
       SELECT id
       FROM deleted_deck`,
      [deckId, req.user.userId]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getStats(req, res, db, now = new Date()) {
  try {
    const todayStart = startOfLocalDay(now);
    const tomorrowStart = addLocalDays(todayStart, 1);
    const sevenDayLookbackStart = addLocalDays(todayStart, -7);
    const thirtyDayLookbackStart = addLocalDays(todayStart, -30);

    const { rows } = await db.query(
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
      [req.user.userId, todayStart, tomorrowStart, sevenDayLookbackStart, thirtyDayLookbackStart]
    );

    const stats = rows[0];
    assertStatsResult(stats);
    return res.json({
      totalCards: toStatsAggregateCount(stats.totalCards),
      totalDecks: toStatsAggregateCount(stats.totalDecks),
      todayReviews: toStatsAggregateCount(stats.todayReviews),
      weekReviews: toStatsAggregateCount(stats.weekReviews),
      monthReviews: toStatsAggregateCount(stats.monthReviews),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSchedulingInsights(req, res, db, now = new Date()) {
  try {
    const {
      todayStart,
      tomorrowStart,
      afterTomorrowStart,
      sevenDayEndExclusive,
    } = getSchedulingInsightDateBoundaries(now);

    const { rows } = await db.query(
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
      [req.user.userId, todayStart, tomorrowStart, afterTomorrowStart, sevenDayEndExclusive]
    );

    const stats = rows[0];
    assertSchedulingInsightsResult(stats);

    const counts = {};
    for (const field of SCHEDULING_INSIGHTS_COUNT_FIELDS) {
      counts[field] = toSafeAggregateCount(
        stats[field],
        INVALID_SCHEDULING_INSIGHTS_RESULT_ERROR
      );
    }

    const overdue = counts.overdue;
    const dueToday = counts.dueToday;
    const focusLoad = overdue + dueToday;
    const averageEaseFactor = toRequiredNullablePositiveAggregateNumber(
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
      recommendedDailyReviewTarget: Math.max(10, Math.ceil(focusLoad * 1.2)),
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
