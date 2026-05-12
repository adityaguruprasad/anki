const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateNextReview } = require('../spacedRepetition');

function assertValidSchedule(result) {
  assert.equal(Number.isInteger(result.interval), true);
  assert.equal(result.interval >= 1, true);
  assert.equal(Number.isFinite(result.ease_factor), true);
  assert.equal(result.ease_factor >= 1.3, true);
  assert.equal(result.next_review instanceof Date, true);
  assert.equal(Number.isNaN(result.next_review.getTime()), false);
}

function withTimezone(timezone, callback) {
  const originalTimezone = process.env.TZ;
  process.env.TZ = timezone;
  try {
    callback();
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  }
}

function assertTimezoneObservesDst(timezone, startDate, endDate, expectedOffsets) {
  const startOffset = startDate.getTimezoneOffset();
  const endOffset = endDate.getTimezoneOffset();

  assert.equal(
    startOffset,
    expectedOffsets.start,
    `${timezone} offset must be applied at the start of this fixture window`,
  );
  assert.equal(
    endOffset,
    expectedOffsets.end,
    `${timezone} offset must be applied at the end of this fixture window`,
  );
  assert.notEqual(
    startOffset,
    endOffset,
    `${timezone} must observe DST across this fixture window`,
  );
}

test('calculateNextReview returns safe defaults for missing persisted values', () => {
  const result = calculateNextReview({}, 4);

  assertValidSchedule(result);
  assert.equal(result.interval, 6);
  assert.equal(result.ease_factor, 2.5);
});

test('calculateNextReview uses initial pass interval for first review of persisted new cards', () => {
  const reviewedAt = new Date('2026-05-10T14:30:00.000Z');
  const result = calculateNextReview({
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
  }, 3, reviewedAt);

  assertValidSchedule(result);
  assert.equal(result.interval, 6);
  assert.equal(result.ease_factor, 2.5);
  assert.equal(result.next_review.toISOString(), '2026-05-16T14:30:00.000Z');
});

test('calculateNextReview uses relearn interval for failed first review of persisted new cards', () => {
  const reviewedAt = new Date('2026-05-10T14:30:00.000Z');
  const result = calculateNextReview({
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
  }, 2, reviewedAt);

  assertValidSchedule(result);
  assert.equal(result.interval, 1);
  assert.equal(result.ease_factor, 2.3);
  assert.equal(result.next_review.toISOString(), '2026-05-11T14:30:00.000Z');
});

test('calculateNextReview keeps persisted interval growth after the first completed review', () => {
  const result = calculateNextReview({
    interval: 1,
    ease_factor: 2.5,
    review_count: 1,
  }, 3);

  assertValidSchedule(result);
  assert.equal(result.interval, 3);
  assert.equal(result.ease_factor, 2.5);
});

test('calculateNextReview treats null review_count as legacy persisted state', () => {
  const result = calculateNextReview({
    interval: 4,
    ease_factor: 2,
    review_count: null,
  }, 3);

  assertValidSchedule(result);
  assert.equal(result.interval, 8);
  assert.equal(result.ease_factor, 2);
});

test('calculateNextReview treats non-numeric review_count as legacy persisted state', () => {
  const result = calculateNextReview({
    interval: 4,
    ease_factor: 2,
    review_count: 'unknown',
  }, 3);

  assertValidSchedule(result);
  assert.equal(result.interval, 8);
  assert.equal(result.ease_factor, 2);
});

test('calculateNextReview anchors next review to the provided review time', () => {
  const reviewedAt = new Date('2026-05-10T14:30:00.000Z');
  const result = calculateNextReview({ interval: 2, ease_factor: 2 }, 3, reviewedAt);

  assertValidSchedule(result);
  assert.equal(result.interval, 4);
  assert.equal(result.next_review.toISOString(), '2026-05-14T14:30:00.000Z');
  assert.equal(reviewedAt.toISOString(), '2026-05-10T14:30:00.000Z');
});

test('calculateNextReview keeps UTC instant stable across spring-forward DST', () => {
  withTimezone('America/New_York', () => {
    const reviewedAt = new Date('2026-03-07T15:30:00.000Z');
    assertTimezoneObservesDst(
      'America/New_York',
      reviewedAt,
      new Date('2026-03-13T15:30:00.000Z'),
      { start: 300, end: 240 },
    );

    const result = calculateNextReview({ interval: 3, ease_factor: 2 }, 3, reviewedAt);

    assertValidSchedule(result);
    assert.equal(result.interval, 6);
    assert.equal(result.next_review.toISOString(), '2026-03-13T15:30:00.000Z');
    assert.equal(reviewedAt.toISOString(), '2026-03-07T15:30:00.000Z');
  });
});

test('calculateNextReview keeps UTC instant stable across fall-back DST', () => {
  withTimezone('America/New_York', () => {
    const reviewedAt = new Date('2026-10-31T15:30:00.000Z');
    assertTimezoneObservesDst(
      'America/New_York',
      reviewedAt,
      new Date('2026-11-06T15:30:00.000Z'),
      { start: 240, end: 300 },
    );

    const result = calculateNextReview({ interval: 3, ease_factor: 2 }, 3, reviewedAt);

    assertValidSchedule(result);
    assert.equal(result.interval, 6);
    assert.equal(result.next_review.toISOString(), '2026-11-06T15:30:00.000Z');
    assert.equal(reviewedAt.toISOString(), '2026-10-31T15:30:00.000Z');
  });
});

test('calculateNextReview rejects invalid review date anchors', () => {
  assert.throws(
    () => calculateNextReview({ interval: 2, ease_factor: 2 }, 3, 'not-a-date'),
    /Invalid review date/,
  );
  assert.throws(
    () => calculateNextReview({ interval: 2, ease_factor: 2 }, 3, null),
    /Invalid review date/,
  );
});

test('calculateNextReview sanitizes NaN and negative persisted scheduling values', () => {
  const result = calculateNextReview({ interval: -10, ease_factor: Number.NaN }, 3);

  assertValidSchedule(result);
  assert.equal(result.interval, 6);
  assert.equal(result.ease_factor, 2.5);
});

test('calculateNextReview enforces low-quality reset and ease penalty semantics', () => {
  const result = calculateNextReview({ interval: 12, ease_factor: 2.2 }, 2);

  assertValidSchedule(result);
  assert.equal(result.interval, 1);
  assert.equal(result.ease_factor, 2);
});

test('calculateNextReview applies the visible Hard answer ease penalty', () => {
  const result = calculateNextReview({ interval: 12, ease_factor: 2.2 }, 1);

  assertValidSchedule(result);
  assert.equal(result.interval, 1);
  assert.equal(result.ease_factor, 2);
});

test('calculateNextReview treats quality 3 as passing without low-quality ease penalty', () => {
  const result = calculateNextReview({ interval: 12, ease_factor: 2.2 }, 3);

  assertValidSchedule(result);
  assert.equal(result.interval, 26);
  assert.equal(result.ease_factor, 2.2);
});

test('calculateNextReview keeps growth semantics for quality >= 3 with clamped ease factor', () => {
  const result = calculateNextReview({ interval: 3.2, ease_factor: 1.1 }, 3);

  assertValidSchedule(result);
  assert.equal(result.interval, 4);
  assert.equal(result.ease_factor, 1.3);
});

test('calculateNextReview never lets ease factor drop below floor for quality 0', () => {
  const result = calculateNextReview({ interval: 7, ease_factor: 1.31 }, 0);

  assertValidSchedule(result);
  assert.equal(result.interval, 1);
  assert.equal(result.ease_factor, 1.3);
});
