const {
  hasRouteSafeCardId,
  hasSameRouteSafeCardId,
} = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');

const QUALITY_LABELS = Object.freeze({
  1: 'Hard',
  3: 'Good',
  5: 'Easy',
});

const STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS = Object.freeze({
  LOAD_NEXT_DUE_CARD: 'load-next-due-card',
});

const STALE_CARD_CONFLICT_MESSAGE = 'This card was already rescheduled and is no longer due. Moving to the next due card.';
// Mirrors the backend scheduler/response contract; keep aligned with spacedRepetition/apiHandlers.
const MIN_STUDY_SESSION_EASE_FACTOR = 1.3;
const MAX_STUDY_SESSION_INTERVAL_DAYS = 36500;

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
  const nextReviewDate = getValidNextReviewDate(card.next_review);
  if (nextReviewDate === null || !isValidIsoTimestamp(card.last_reviewed)) {
    return false;
  }

  const lastReviewedDate = new Date(card.last_reviewed);
  if (
    Number.isNaN(lastReviewedDate.getTime())
    || lastReviewedDate.getTime() > nextReviewDate.getTime()
  ) {
    return false;
  }

  return (
    Number.isSafeInteger(card.interval)
    && card.interval >= 1
    && card.interval <= MAX_STUDY_SESSION_INTERVAL_DAYS
    && typeof card.ease_factor === 'number'
    && Number.isFinite(card.ease_factor)
    && card.ease_factor >= MIN_STUDY_SESSION_EASE_FACTOR
    && Number.isSafeInteger(card.review_count)
    && card.review_count >= 0
  );
}

function getValidatedStudySessionSubmissionResponse(response, options = {}) {
  if (!isObjectRecord(response)) {
    return null;
  }

  if (response.success !== true) {
    return null;
  }

  const { card } = response;

  if (!isObjectRecord(card)) {
    return null;
  }

  if (typeof card.id !== 'number' || !hasRouteSafeCardId(card.id)) {
    return null;
  }

  // expectedId opts callers into submitted-card matching; omitting it preserves legacy shape validation.
  if (
    options.expectedId !== undefined
    && (
      !hasRouteSafeCardId(options.expectedId)
      || !hasSameRouteSafeCardId(card.id, options.expectedId)
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
  const qualityLabel = getStudySessionQualityLabel(options.quality);
  const messageStart = qualityLabel ? `Answered ${qualityLabel}.` : 'Answer submitted.';
  const nextReviewDate = getValidNextReviewDate(options.response?.card?.next_review);

  if (!nextReviewDate) {
    return {
      message: `${messageStart} Review schedule updated.`,
    };
  }

  const formatDate = typeof options.formatDate === 'function'
    ? options.formatDate
    : formatNextReviewDate;

  return {
    message: `${messageStart} Next review: ${formatDate(nextReviewDate)}.`,
  };
}

function getStudySessionSubmissionRecovery(response) {
  if (!response || response.status !== 409) {
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
