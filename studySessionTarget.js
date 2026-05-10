const {
  hasDashboardDeckListPayload,
  hasDueCards,
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

  const targetDeck = selectStudyDeckTarget(decks);

  if (hasDueCards(targetDeck)) {
    return {
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: targetDeck.id,
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

module.exports = {
  STUDY_SESSION_REQUESTS,
  getStudySessionRequest,
  getValidatedStudySessionDeckListRequest,
  parseDeckId,
};
