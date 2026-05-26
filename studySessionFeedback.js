const {
  hasRouteSafeCardId,
  hasSameRouteSafeCardId,
} = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

const QUALITY_LABELS = Object.freeze({
  1: 'Hard',
  3: 'Good',
  5: 'Easy',
});

const STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS = Object.freeze({
  LOAD_NEXT_DUE_CARD: 'load-next-due-card',
});

const STALE_CARD_CONFLICT_MESSAGE = 'This card was already rescheduled and is no longer due. Moving to the next due card.';
// Keep aligned with the backend 409 API payload for not-due study submissions.
const STALE_CARD_CONFLICT_API_ERROR = 'Card is not due';
// Mirrors the backend scheduler/response contract; keep aligned with spacedRepetition/apiHandlers.
const MIN_STUDY_SESSION_EASE_FACTOR = 1.3;
const MAX_STUDY_SESSION_INTERVAL_DAYS = 36500;

function parseStudySessionSubmissionResponse(responseText) {
  if (typeof responseText !== 'string' || responseText.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(responseText);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getStudySessionQualityLabel(quality) {
  if (!Object.prototype.hasOwnProperty.call(QUALITY_LABELS, quality)) {
    return null;
  }

  return QUALITY_LABELS[quality];
}

function getValidNextReviewDate(nextReview) {
  if (!isValidIsoTimestamp(nextReview)) {
    return null;
  }

  const nextReviewDate = new Date(nextReview);

  if (Number.isNaN(nextReviewDate.getTime())) {
    return null;
  }

  return nextReviewDate;
}

function hasValidStudySessionSchedulingFields(card) {
  const nextReview = getOwnDataPropertyValue(card, 'next_review');
  const lastReviewed = getOwnDataPropertyValue(card, 'last_reviewed');
  const interval = getOwnDataPropertyValue(card, 'interval');
  const easeFactor = getOwnDataPropertyValue(card, 'ease_factor');
  const reviewCount = getOwnDataPropertyValue(card, 'review_count');
  const nextReviewDate = getValidNextReviewDate(nextReview);
  if (nextReviewDate === null || !isValidIsoTimestamp(lastReviewed)) {
    return false;
  }

  const lastReviewedDate = new Date(lastReviewed);
  const lastReviewedAt = lastReviewedDate.getTime();
  const nextReviewAt = nextReviewDate.getTime();
  // Backend apiHandlers and cards_review_temporal_order_check require this
  // strict order for successful post-review responses.
  if (
    Number.isNaN(lastReviewedAt)
    || lastReviewedAt >= nextReviewAt
  ) {
    return false;
  }

  return (
    Number.isSafeInteger(interval)
    && interval >= 1
    && interval <= MAX_STUDY_SESSION_INTERVAL_DAYS
    && typeof easeFactor === 'number'
    && Number.isFinite(easeFactor)
    && easeFactor >= MIN_STUDY_SESSION_EASE_FACTOR
    && Number.isSafeInteger(reviewCount)
    && reviewCount >= 0
  );
}

function getValidatedStudySessionSubmissionResponse(response, options = {}) {
  if (!isObjectRecord(response)) {
    return null;
  }

  if (getOwnDataPropertyValue(response, 'success') !== true) {
    return null;
  }

  const card = getOwnDataPropertyValue(response, 'card');

  if (!isObjectRecord(card)) {
    return null;
  }

  const cardId = getOwnDataPropertyValue(card, 'id');
  if (typeof cardId !== 'number' || !hasRouteSafeCardId(cardId)) {
    return null;
  }

  // expectedId opts callers into submitted-card matching; omitting it preserves legacy shape validation.
  const expectedId = getOwnDataPropertyValue(options, 'expectedId');
  if (
    expectedId !== undefined
    && (
      !hasRouteSafeCardId(expectedId)
      || !hasSameRouteSafeCardId(cardId, expectedId)
    )
  ) {
    return null;
  }

  if (!hasValidStudySessionSchedulingFields(card)) {
    return null;
  }

  return response;
}

function formatNextReviewDate(nextReviewDate) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(nextReviewDate);
}

function getStudySessionSubmissionFeedback(options = {}) {
  const quality = getOwnDataPropertyValue(options, 'quality');
  const response = getOwnDataPropertyValue(options, 'response');
  const formatDateOption = getOwnDataPropertyValue(options, 'formatDate');
  const qualityLabel = getStudySessionQualityLabel(quality);
  const messageStart = qualityLabel ? `Answered ${qualityLabel}.` : 'Answer submitted.';
  const card = getOwnDataPropertyValue(response, 'card');
  const nextReviewDate = getValidNextReviewDate(getOwnDataPropertyValue(card, 'next_review'));

  if (!nextReviewDate) {
    return {
      message: `${messageStart} Review schedule updated.`,
    };
  }

  const formatDate = typeof formatDateOption === 'function'
    ? formatDateOption
    : formatNextReviewDate;

  return {
    message: `${messageStart} Next review: ${formatDate(nextReviewDate)}.`,
  };
}

function getStudySessionSubmissionRecovery(response, payload) {
  let status;
  try {
    // Fetch Response.status is intentionally read through the native status getter;
    // untrusted JSON payloads use own data-property access instead.
    status = response?.status;
  } catch {
    return null;
  }

  if (
    status !== 409
    || !isObjectRecord(payload)
    || getOwnDataPropertyValue(payload, 'error') !== STALE_CARD_CONFLICT_API_ERROR
  ) {
    return null;
  }

  return {
    action: STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS.LOAD_NEXT_DUE_CARD,
    message: STALE_CARD_CONFLICT_MESSAGE,
  };
}

module.exports = {
  STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS,
  getStudySessionQualityLabel,
  getStudySessionSubmissionFeedback,
  getStudySessionSubmissionRecovery,
  getValidatedStudySessionSubmissionResponse,
  parseStudySessionSubmissionResponse,
};
