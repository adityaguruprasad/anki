const DEFAULT_AUTH_RETURN_DESTINATION = '/';
const AUTH_RETURN_DESTINATION_STATE_KEY = 'returnTo';
const LOGIN_ROUTE_PATHNAME = '/login';
const URL_PARSE_BASE = 'https://anki.local';

function hasUnsafeUrlCharacters(value) {
  return /[\u0000-\u0020\u007f]/.test(value) || value.includes('\\');
}

function hasMalformedUrlEscapes(value) {
  try {
    decodeURI(value);
  } catch {
    return true;
  }

  return false;
}

function startsWithProtocolRelativePrefix(value) {
  return value[0] === '/' && value[1] === '/';
}

function normalizeAuthReturnDestination(destination) {
  if (typeof destination !== 'string') {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  if (
    destination === ''
    || destination[0] !== '/'
    || startsWithProtocolRelativePrefix(destination)
    || hasUnsafeUrlCharacters(destination)
    || hasMalformedUrlEscapes(destination)
  ) {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  let parsedDestination;
  try {
    parsedDestination = new URL(destination, URL_PARSE_BASE);
  } catch {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  if (parsedDestination.origin !== URL_PARSE_BASE) {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  const normalizedDestination = `${parsedDestination.pathname}${parsedDestination.search}${parsedDestination.hash}`;

  if (startsWithProtocolRelativePrefix(normalizedDestination)) {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  return normalizedDestination || DEFAULT_AUTH_RETURN_DESTINATION;
}

function getStringProperty(value, propertyName) {
  if (value === null || typeof value !== 'object') {
    return '';
  }

  try {
    const propertyValue = value[propertyName];
    return typeof propertyValue === 'string' ? propertyValue : '';
  } catch {
    return '';
  }
}

function getAuthReturnDestinationFromLocation(location) {
  const pathname = getStringProperty(location, 'pathname');
  const search = getStringProperty(location, 'search');
  const hash = getStringProperty(location, 'hash');
  const normalizedSearch = search === '' || search[0] === '?' ? search : '';
  const normalizedHash = hash === '' || hash[0] === '#' ? hash : '';

  return normalizeAuthReturnDestination(`${pathname}${normalizedSearch}${normalizedHash}`);
}

function createAuthReturnState(location) {
  return {
    [AUTH_RETURN_DESTINATION_STATE_KEY]: getAuthReturnDestinationFromLocation(location),
  };
}

function createAuthReturnLoginRedirect(location) {
  return {
    pathname: LOGIN_ROUTE_PATHNAME,
    state: createAuthReturnState(location),
  };
}

function getAuthReturnDestinationFromState(state) {
  if (state === null || typeof state !== 'object') {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  let destination;
  try {
    destination = state[AUTH_RETURN_DESTINATION_STATE_KEY];
  } catch {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  return normalizeAuthReturnDestination(destination);
}

module.exports = {
  AUTH_RETURN_DESTINATION_STATE_KEY,
  DEFAULT_AUTH_RETURN_DESTINATION,
  LOGIN_ROUTE_PATHNAME,
  createAuthReturnLoginRedirect,
  createAuthReturnState,
  getAuthReturnDestinationFromLocation,
  getAuthReturnDestinationFromState,
  normalizeAuthReturnDestination,
};
