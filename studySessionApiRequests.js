const { resolveApiBaseUrl } = require('./authFormState');

function encodeRouteSegment(value) {
  return encodeURIComponent(String(value));
}

function getStudySessionApiRequests(env) {
  const baseUrl = resolveApiBaseUrl(env);

  return {
    dueCardUrl(deckId) {
      return `${baseUrl}/api/cards/${encodeRouteSegment(deckId)}?limit=1`;
    },
    deckListUrl: `${baseUrl}/api/decks`,
    submitUrl: `${baseUrl}/api/study-session`,
  };
}

module.exports = {
  getStudySessionApiRequests,
};
