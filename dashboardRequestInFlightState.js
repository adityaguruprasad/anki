const DASHBOARD_REQUEST_DOMAINS = Object.freeze({
  STATS: 'stats',
  DECK_LIST: 'deck-list',
  SCHEDULING_INSIGHTS: 'scheduling-insights',
});

function normalizeRequestPart(value) {
  return String(value);
}

function getDashboardRequest(inFlightRequests, domain) {
  if (!inFlightRequests || typeof inFlightRequests !== 'object') {
    return null;
  }

  return inFlightRequests[normalizeRequestPart(domain)] || null;
}

function isDashboardRequestInFlight(inFlightRequests, domain, url) {
  const request = getDashboardRequest(inFlightRequests, domain);

  return Boolean(request && request.url === normalizeRequestPart(url));
}

function beginDashboardRequest(inFlightRequests, domain, url) {
  if (!inFlightRequests || typeof inFlightRequests !== 'object') {
    return null;
  }

  const domainKey = normalizeRequestPart(domain);
  const urlKey = normalizeRequestPart(url);

  if (isDashboardRequestInFlight(inFlightRequests, domainKey, urlKey)) {
    return null;
  }

  const request = Object.freeze({
    domain: domainKey,
    url: urlKey,
  });

  inFlightRequests[domainKey] = request;
  return request;
}

function completeDashboardRequest(inFlightRequests, request) {
  if (
    !inFlightRequests
    || typeof inFlightRequests !== 'object'
    || !request
    || typeof request !== 'object'
  ) {
    return false;
  }

  const domainKey = normalizeRequestPart(request.domain);

  if (inFlightRequests[domainKey] !== request) {
    return false;
  }

  delete inFlightRequests[domainKey];
  return true;
}

module.exports = {
  DASHBOARD_REQUEST_DOMAINS,
  beginDashboardRequest,
  completeDashboardRequest,
  isDashboardRequestInFlight,
};
