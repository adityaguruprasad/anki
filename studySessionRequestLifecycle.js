function isMountedStudySessionRequest(mountedRef) {
  return Boolean(mountedRef && mountedRef.current);
}

function isCurrentStudySessionRouteRequest(options = {}) {
  const { mountedRef, locationSearchRef, requestSearch } = options;

  return isMountedStudySessionRequest(mountedRef)
    && Boolean(locationSearchRef)
    && locationSearchRef.current === requestSearch;
}

function isCurrentStudySessionFetchRequest(options = {}) {
  const { requestIdRef, requestId } = options;

  return isCurrentStudySessionRouteRequest(options)
    && Boolean(requestIdRef)
    && requestIdRef.current === requestId;
}

function handleStudySessionAuthResponse(options) {
  const {
    handleAuthExpiredResponse,
    isCurrent,
    onCurrentAuthExpired,
    onAuthExpired,
    response,
  } = options;

  if (!isCurrent()) {
    return true;
  }

  if (handleAuthExpiredResponse(response, onAuthExpired)) {
    onCurrentAuthExpired();
    return true;
  }

  return false;
}

module.exports = {
  handleStudySessionAuthResponse,
  isCurrentStudySessionFetchRequest,
  isCurrentStudySessionRouteRequest,
  isMountedStudySessionRequest,
};
