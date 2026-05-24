const { normalizeAuthToken } = require('./authTokenValidation');
const { getStorageGetItem } = require('./storageGetItem');

const AUTH_TOKEN_STORAGE_KEY = 'token';

function readToken(tokenSource) {
  if (typeof tokenSource === 'function') {
    return tokenSource();
  }

  const getItem = getStorageGetItem(tokenSource);
  if (getItem) {
    return getItem.call(tokenSource, AUTH_TOKEN_STORAGE_KEY);
  }

  return tokenSource;
}

function buildAuthHeaders(tokenSource) {
  let token;

  try {
    token = readToken(tokenSource);
  } catch {
    return {};
  }

  const normalizedToken = normalizeAuthToken(token);
  if (normalizedToken === null) {
    return {};
  }

  return {
    Authorization: `Bearer ${normalizedToken}`,
  };
}

module.exports = {
  AUTH_TOKEN_STORAGE_KEY,
  buildAuthHeaders,
};
