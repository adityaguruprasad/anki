const { resolveApiBaseUrl } = require('./authFormState');
const { requireRouteSafeId } = require('./cardIdentifier');

function encodeRouteId(value, fieldName) {
  return encodeURIComponent(requireRouteSafeId(value, fieldName));
}

function getDeckManagementApiRequests(env) {
  const baseUrl = resolveApiBaseUrl(env);

  return {
    deckListUrl: `${baseUrl}/api/decks`,
    createDeckUrl: `${baseUrl}/api/decks`,
    renameDeckUrl(deckId) {
      return `${baseUrl}/api/decks/${encodeRouteId(deckId, 'deckId')}`;
    },
    removeDeckUrl(deckId) {
      return `${baseUrl}/api/decks/${encodeRouteId(deckId, 'deckId')}`;
    },
    browseDeckCardsUrl(deckId, queryParams) {
      return `${baseUrl}/api/decks/${encodeRouteId(deckId, 'deckId')}/cards?${String(queryParams)}`;
    },
    createCardUrl: `${baseUrl}/api/cards`,
    updateCardUrl(cardId) {
      return `${baseUrl}/api/cards/${encodeRouteId(cardId, 'cardId')}`;
    },
    removeCardUrl(cardId) {
      return `${baseUrl}/api/cards/${encodeRouteId(cardId, 'cardId')}`;
    },
  };
}

module.exports = {
  getDeckManagementApiRequests,
};
