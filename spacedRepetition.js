// spacedRepetition.js
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const INITIAL_GOOD_INTERVAL = 6;

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

const calculateNextReview = (card, quality) => {
  let ease_factor = normalizeEaseFactor(card?.ease_factor);
  const storedInterval = normalizeInterval(card?.interval);
  let interval;

  // If there's no usable persisted interval, apply initial scheduling defaults.
  if (storedInterval === null) {
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

  // Calculate next review date
  const next_review = new Date();
  next_review.setDate(next_review.getDate() + interval);

  return {
    ease_factor,
    interval,
    next_review
  };
};

module.exports = { calculateNextReview };
