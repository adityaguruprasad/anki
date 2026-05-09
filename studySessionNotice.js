const STUDY_SESSION_NOTICE_TYPES = {
  NO_DUE_CARDS: 'no-due-cards',
  DECK_AVAILABILITY_ERROR: 'deck-availability-error',
  DUE_CARD_FETCH_ERROR: 'due-card-fetch-error',
};

const noticeContracts = {
  [STUDY_SESSION_NOTICE_TYPES.NO_DUE_CARDS]: {
    title: 'No due cards right now',
    message: 'There are no cards due for review. Browse or manage your decks to add cards or choose what to study next.',
    canRetry: false,
    canManageDecks: true,
  },
  [STUDY_SESSION_NOTICE_TYPES.DECK_AVAILABILITY_ERROR]: {
    title: 'Unable to check deck availability',
    message: 'Try again or manage your decks to review and add cards.',
    canRetry: true,
    canManageDecks: true,
  },
  [STUDY_SESSION_NOTICE_TYPES.DUE_CARD_FETCH_ERROR]: {
    title: 'Unable to load cards for this deck',
    message: 'Try again or manage your decks to choose another deck.',
    canRetry: true,
    canManageDecks: true,
  },
};

function getStudySessionNotice(type) {
  const notice = noticeContracts[type];

  if (!notice) {
    throw new Error(`Unknown study session notice type: ${type}`);
  }

  return {
    title: notice.title,
    message: notice.message,
    canRetry: notice.canRetry,
    canManageDecks: notice.canManageDecks,
  };
}

module.exports = {
  STUDY_SESSION_NOTICE_TYPES,
  getStudySessionNotice,
};
