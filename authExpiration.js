const AUTH_EXPIRED_HTTP_STATUSES = Object.freeze([401, 403]);

function isAuthExpiredResponse(response) {
  if (response === null || typeof response !== 'object') {
    return false;
  }

  let status;
  try {
    status = response.status;
  } catch {
    return false;
  }

  return AUTH_EXPIRED_HTTP_STATUSES.includes(status);
}

function handleAuthExpiredResponse(response, onAuthExpired) {
  if (!isAuthExpiredResponse(response)) {
    return false;
  }

  if (typeof onAuthExpired !== 'function') {
    return true;
  }

  try {
    onAuthExpired(response);
  } catch {
    return true;
  }

  return true;
}

module.exports = {
  AUTH_EXPIRED_HTTP_STATUSES,
  handleAuthExpiredResponse,
  isAuthExpiredResponse,
};
