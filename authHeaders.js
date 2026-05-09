const AUTH_TOKEN_STORAGE_KEY = 'token';

function readToken(tokenSource) {
  if (typeof tokenSource === 'function') {
    return tokenSource();
  }

  if (tokenSource && typeof tokenSource.getItem === 'function') {
    return tokenSource.getItem(AUTH_TOKEN_STORAGE_KEY);
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

  if (typeof token !== 'string') {
    return {};
  }

  const trimmedToken = token.trim();

  if (!trimmedToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${trimmedToken}`,
  };
}

module.exports = {
  AUTH_TOKEN_STORAGE_KEY,
  buildAuthHeaders,
};
