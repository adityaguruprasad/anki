const QUALITY_LABELS = Object.freeze({
  1: 'Hard',
  3: 'Good',
  5: 'Easy',
});

function parseStudySessionSubmissionResponse(responseText) {
  if (typeof responseText !== 'string' || responseText.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(responseText);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
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

module.exports = {
  getStudySessionQualityLabel,
  getStudySessionSubmissionFeedback,
  parseStudySessionSubmissionResponse,
};
