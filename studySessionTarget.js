const {
  hasDashboardDeckListPayload,
  hasDueCards,
  normalizeStudyDeckId,
  selectStudyDeckTarget,
} = require('./dashboardDeckTarget');

const STUDY_SESSION_REQUESTS = {
  LOAD_CARDS: 'load-cards',
  LOAD_DECKS: 'load-decks',
  NO_DUE_DECK: 'no-due-deck',
};

function parseDeckId(search) {
  const deckIdParam = new URLSearchParams(search || '').get('deckId');

  if (!deckIdParam || !/^\d+$/.test(deckIdParam)) {
    return null;
  }

  const parsedDeckId = Number(deckIdParam);
  return Number.isSafeInteger(parsedDeckId) && parsedDeckId > 0 ? parsedDeckId : null;
}

function selectDueDeckForRecovery(decks) {
  if (!Array.isArray(decks)) {
    return null;
  }

  let selectedDeck = null;

  for (const deck of decks) {
    if (!hasDueCards(deck)) {
      continue;
    }

    if (!selectedDeck || deck.dueCards > selectedDeck.dueCards) {
      selectedDeck = deck;
    }
  }

  return selectedDeck;
}

function selectStudySessionTarget(decks) {
  const routeableTarget = selectStudyDeckTarget(decks);

  if (hasDueCards(routeableTarget)) {
    return routeableTarget;
  }

  return selectDueDeckForRecovery(decks) || routeableTarget;
}

function getStudySessionRequest(search, decks) {
  const explicitDeckId = parseDeckId(search);

  if (explicitDeckId !== null) {
    return {
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: explicitDeckId,
      source: 'explicit',
    };
  }

  if (decks === undefined) {
    return { type: STUDY_SESSION_REQUESTS.LOAD_DECKS };
  }

  const targetDeck = selectStudySessionTarget(decks);
  const targetDeckId = targetDeck ? normalizeStudyDeckId(targetDeck.id) : null;

  if (targetDeckId && hasDueCards(targetDeck)) {
    return {
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: Number(targetDeckId),
      deck: targetDeck,
      source: 'selected',
    };
  }

  return {
    type: STUDY_SESSION_REQUESTS.NO_DUE_DECK,
    deck: targetDeck,
  };
}

function getValidatedStudySessionDeckListRequest(search, decks) {
  if (!hasDashboardDeckListPayload(decks)) {
    throw new Error('Malformed deck list payload');
  }

  return getStudySessionRequest(search, decks);
}

function shouldShowNoDueNoticeForInitialStudySessionRequest(request) {
  return request?.type === STUDY_SESSION_REQUESTS.LOAD_CARDS
    && (request.source === 'explicit' || request.source === 'selected');
}

module.exports = {
  STUDY_SESSION_REQUESTS,
  getStudySessionRequest,
  getValidatedStudySessionDeckListRequest,
  parseDeckId,
  shouldShowNoDueNoticeForInitialStudySessionRequest,
};
