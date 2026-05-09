const { resolveApiBaseUrl } = require('./authFormState');

function getDashboardApiRequests(env) {
  const baseUrl = resolveApiBaseUrl(env);

  return {
    statsUrl: `${baseUrl}/api/stats`,
    deckListUrl: `${baseUrl}/api/decks`,
    schedulingInsightsUrl: `${baseUrl}/api/scheduling-insights`,
  };
}

module.exports = {
  getDashboardApiRequests,
};
