const { resolveApiBaseUrl } = require('./authFormState');

function getDashboardApiRequests(env) {
  const baseUrl = resolveApiBaseUrl(env);

  return {
    statsUrl: `${baseUrl}/api/stats`,
    deckListUrl: `${baseUrl}/api/decks`,
  };
}

module.exports = {
  getDashboardApiRequests,
};
