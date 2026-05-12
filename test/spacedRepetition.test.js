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

test('calculateNextReview returns safe defaults for missing persisted values', () => {
  const result = calculateNextReview({}, 4);

  assertValidSchedule(result);
  assert.equal(result.interval, 6);
  assert.equal(result.ease_factor, 2.5);
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
