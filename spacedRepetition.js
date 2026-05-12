// spacedRepetition.js
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const INITIAL_GOOD_INTERVAL = 6;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const normalizeEaseFactor = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_EASE_FACTOR;
  }
  return Math.max(MIN_EASE_FACTOR, numeric);
};

const normalizeInterval = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return null;
  }
  return Math.max(1, Math.round(numeric));
};

const hasExplicitInitialReviewCount = (card) => {
  if (!Object.prototype.hasOwnProperty.call(card ?? {}, 'review_count')) {
    return false;
  }

  // Only an explicit, finite review_count <= 0 marks a persisted card as new.
  // Null means "absent/legacy" here; missing, null, or non-finite counts keep
  // the legacy persisted-interval behavior.
  if (card.review_count === null) {
    return false;
  }

  const reviewCount = Number(card.review_count);
  return Number.isFinite(reviewCount) && reviewCount <= 0;
};

const normalizeReviewDate = (value) => {
  if (value === null) {
    throw new TypeError('Invalid review date');
  }
  const reviewDate = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(reviewDate.getTime())) {
    throw new TypeError('Invalid review date');
  }
  return reviewDate;
};

const assertValidQuality = (quality) => {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new TypeError('Invalid review quality: expected an integer from 0 through 5');
  }
};

const calculateNextReview = (card, quality, reviewedAt) => {
  assertValidQuality(quality);

  let ease_factor = normalizeEaseFactor(card?.ease_factor);
  const storedInterval = normalizeInterval(card?.interval);
  let interval;

  // If there's no usable persisted interval, apply initial scheduling defaults.
  if (storedInterval === null || hasExplicitInitialReviewCount(card)) {
    interval = quality < 3 ? 1 : INITIAL_GOOD_INTERVAL;
  } else if (quality >= 3) {
    interval = Math.max(1, Math.round(storedInterval * ease_factor));
  } else {
    interval = 1;
  }

  // Low-quality answers should make future reviews more conservative.
  if (quality < 3) {
    ease_factor = Math.max(MIN_EASE_FACTOR, ease_factor - 0.2);
  } else if (quality === 5) {
    ease_factor += 0.15;
  }
  ease_factor = normalizeEaseFactor(ease_factor);

  // Calculate next review date using UTC duration arithmetic so DST cannot
  // shift the scheduled instant when the process timezone observes DST.
  const reviewDate = normalizeReviewDate(reviewedAt);
  const next_review = new Date(reviewDate.getTime() + interval * DAY_IN_MS);

  return {
    ease_factor,
    interval,
    next_review
  };
};

module.exports = { calculateNextReview };
