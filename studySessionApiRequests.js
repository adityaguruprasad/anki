const { resolveApiBaseUrl } = require('./authFormState');
const { requireRouteSafeId } = require('./cardIdentifier');

function encodeRouteId(value, fieldName) {
  return encodeURIComponent(requireRouteSafeId(value, fieldName));
}

function getStudySessionApiRequests(env) {
  const baseUrl = resolveApiBaseUrl(env);

  return {
    dueCardUrl(deckId) {
      return `${baseUrl}/api/cards/${encodeRouteId(deckId, 'deckId')}?limit=1`;
    },
    deckListUrl: `${baseUrl}/api/decks`,
    submitUrl: `${baseUrl}/api/study-session`,
  };
}

module.exports = {
  getStudySessionApiRequests,
};
