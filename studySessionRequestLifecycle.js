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

module.exports = {
  isCurrentStudySessionFetchRequest,
  isCurrentStudySessionRouteRequest,
  isMountedStudySessionRequest,
};
