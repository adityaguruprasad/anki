const QUALITY_LABELS = Object.freeze({
  1: 'Hard',
  3: 'Good',
  5: 'Easy',
});

const STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS = Object.freeze({
  LOAD_NEXT_DUE_CARD: 'load-next-due-card',
});

const STALE_CARD_CONFLICT_MESSAGE = 'This card was already rescheduled and is no longer due. Moving to the next due card.';

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
  if (typeof nextReview !== 'string' || nextReview.trim() === '') {
    return null;
  }

  const nextReviewDate = new Date(nextReview);

  if (Number.isNaN(nextReviewDate.getTime())) {
    return null;
  }

  return nextReviewDate;
}

function getValidatedStudySessionSubmissionResponse(response) {
  if (!isObjectRecord(response)) {
    return null;
  }

  const { card } = response;

  if (!isObjectRecord(card)) {
    return null;
  }

  if (!Number.isSafeInteger(card.id) || card.id <= 0) {
    return null;
  }

  if (!getValidNextReviewDate(card.next_review)) {
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
