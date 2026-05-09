const { resolveApiBaseUrl } = require('./authFormState');

function encodeRouteSegment(value) {
  return encodeURIComponent(String(value));
}

function getDeckManagementApiRequests(env) {
  const baseUrl = resolveApiBaseUrl(env);

  return {
    deckListUrl: `${baseUrl}/api/decks`,
    createDeckUrl: `${baseUrl}/api/decks`,
    renameDeckUrl(deckId) {
      return `${baseUrl}/api/decks/${encodeRouteSegment(deckId)}`;
    },
    removeDeckUrl(deckId) {
      return `${baseUrl}/api/decks/${encodeRouteSegment(deckId)}`;
    },
    browseDeckCardsUrl(deckId, queryParams) {
      return `${baseUrl}/api/decks/${encodeRouteSegment(deckId)}/cards?${String(queryParams)}`;
    },
    createCardUrl: `${baseUrl}/api/cards`,
    updateCardUrl(cardId) {
      return `${baseUrl}/api/cards/${encodeRouteSegment(cardId)}`;
    },
    removeCardUrl(cardId) {
      return `${baseUrl}/api/cards/${encodeRouteSegment(cardId)}`;
    },
  };
}

module.exports = {
  getDeckManagementApiRequests,
};
