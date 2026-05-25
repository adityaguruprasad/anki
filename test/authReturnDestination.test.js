const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AUTH_RETURN_DESTINATION_STATE_KEY,
  DEFAULT_AUTH_RETURN_DESTINATION,
  LOGIN_ROUTE_PATHNAME,
  createAuthReturnLoginRedirect,
  createAuthReturnState,
  getAuthReturnDestinationFromLocation,
  getAuthReturnDestinationFromState,
  normalizeAuthReturnDestination,
} = require('../authReturnDestination');

test('normalizeAuthReturnDestination preserves app-local absolute paths', () => {
  [
    '/',
    '/decks',
    '/study?deckId=1#card-2',
    '/cards/%2Fescaped?next=http%3A%2F%2Fevil.test#x',
  ].forEach((destination) => {
    assert.equal(normalizeAuthReturnDestination(destination), destination);
  });
});

test('normalizeAuthReturnDestination rejects non-local or malformed destinations', () => {
  [
    undefined,
    null,
    1,
    {},
    '',
    'study',
    'https://evil.test/study',
    'http://anki.local/study',
    '//evil.test/study',
    '///evil.test/study',
    '/study\\evil',
    '/study with spaces',
    '/study%zz',
    '/study?deckId=%',
  ].forEach((destination) => {
    assert.equal(
      normalizeAuthReturnDestination(destination),
      DEFAULT_AUTH_RETURN_DESTINATION,
      `Expected ${String(destination)} to normalize to the default destination`
    );
  });
});

test('normalizeAuthReturnDestination rejects paths that normalize to protocol-relative destinations', () => {
  [
    '/foo/..//evil.com',
    '/foo/%2e%2e//evil.com',
    '/foo/..///evil.com',
  ].forEach((destination) => {
    assert.equal(
      normalizeAuthReturnDestination(destination),
      DEFAULT_AUTH_RETURN_DESTINATION,
      `Expected ${destination} to normalize to the default destination`
    );
  });
});

test('getAuthReturnDestinationFromLocation preserves pathname, search, and hash', () => {
  assert.equal(
    getAuthReturnDestinationFromLocation({
      pathname: '/study',
      search: '?deckId=1&mode=review',
      hash: '#card-2',
    }),
    '/study?deckId=1&mode=review#card-2'
  );
});

test('getAuthReturnDestinationFromLocation normalizes unsafe location shapes', () => {
  assert.equal(getAuthReturnDestinationFromLocation(null), DEFAULT_AUTH_RETURN_DESTINATION);
  assert.equal(
    getAuthReturnDestinationFromLocation({ pathname: '//evil.test/study' }),
    DEFAULT_AUTH_RETURN_DESTINATION
  );
  assert.equal(
    getAuthReturnDestinationFromLocation({
      pathname: '/study',
      search: 'deckId=1',
      hash: 'card-2',
    }),
    '/study'
  );
});

test('getAuthReturnDestinationFromLocation ignores inherited and accessor-backed fields', () => {
  const inheritedDataLocation = Object.create({
    pathname: '/decks',
    search: '?filter=due',
    hash: '#top',
  });
  assert.equal(
    getAuthReturnDestinationFromLocation(inheritedDataLocation),
    DEFAULT_AUTH_RETURN_DESTINATION
  );

  let inheritedPathnameAccessCount = 0;
  const inheritedLocation = Object.create({
    get pathname() {
      inheritedPathnameAccessCount += 1;
      return '/decks';
    },
    get search() {
      throw new Error('inherited search getter should not run');
    },
    get hash() {
      throw new Error('inherited hash getter should not run');
    },
  });
  assert.equal(
    getAuthReturnDestinationFromLocation(inheritedLocation),
    DEFAULT_AUTH_RETURN_DESTINATION
  );
  assert.equal(inheritedPathnameAccessCount, 0);

  const accessorLocation = {};
  let pathnameAccessCount = 0;
  Object.defineProperty(accessorLocation, 'pathname', {
    enumerable: true,
    get() {
      pathnameAccessCount += 1;
      return '/study';
    },
  });

  assert.equal(
    getAuthReturnDestinationFromLocation(accessorLocation),
    DEFAULT_AUTH_RETURN_DESTINATION
  );
  assert.equal(pathnameAccessCount, 0);
});

test('auth return destinations accept null-prototype own string data properties', () => {
  const location = Object.create(null);
  Object.defineProperties(location, {
    pathname: { value: '/study' },
    search: { value: '?deckId=1' },
    hash: { value: '#card-2' },
  });

  assert.equal(
    getAuthReturnDestinationFromLocation(location),
    '/study?deckId=1#card-2'
  );

  const state = Object.create(null);
  Object.defineProperty(state, AUTH_RETURN_DESTINATION_STATE_KEY, {
    value: '/decks?filter=due#top',
  });

  assert.equal(
    getAuthReturnDestinationFromState(state),
    '/decks?filter=due#top'
  );
});

test('auth return destinations accept non-enumerable own string data properties', () => {
  const location = {};
  Object.defineProperties(location, {
    pathname: { value: '/decks' },
    search: { value: '?filter=due' },
    hash: { value: '#top' },
  });
  assert.equal(
    getAuthReturnDestinationFromLocation(location),
    '/decks?filter=due#top'
  );

  const state = {};
  Object.defineProperty(state, AUTH_RETURN_DESTINATION_STATE_KEY, {
    value: '/study?deckId=1#card-2',
  });
  assert.equal(
    getAuthReturnDestinationFromState(state),
    '/study?deckId=1#card-2'
  );
});

test('createAuthReturnState stores the normalized return destination', () => {
  assert.deepEqual(
    createAuthReturnState({
      pathname: '/decks',
      search: '?q=due',
      hash: '#top',
    }),
    {
      [AUTH_RETURN_DESTINATION_STATE_KEY]: '/decks?q=due#top',
    }
  );
});

test('createAuthReturnLoginRedirect targets login with return state', () => {
  assert.deepEqual(
    createAuthReturnLoginRedirect({
      pathname: '/study',
      search: '?deckId=1',
      hash: '#card-2',
    }),
    {
      pathname: LOGIN_ROUTE_PATHNAME,
      state: {
        [AUTH_RETURN_DESTINATION_STATE_KEY]: '/study?deckId=1#card-2',
      },
    }
  );
});

test('getAuthReturnDestinationFromState reads only safe stored destinations', () => {
  assert.equal(
    getAuthReturnDestinationFromState({
      [AUTH_RETURN_DESTINATION_STATE_KEY]: '/decks?filter=all#active',
    }),
    '/decks?filter=all#active'
  );
  assert.equal(
    getAuthReturnDestinationFromState({
      [AUTH_RETURN_DESTINATION_STATE_KEY]: '//evil.test/decks',
    }),
    DEFAULT_AUTH_RETURN_DESTINATION
  );
  assert.equal(getAuthReturnDestinationFromState(null), DEFAULT_AUTH_RETURN_DESTINATION);
});

test('getAuthReturnDestinationFromState ignores inherited and accessor-backed return destinations', () => {
  const inheritedDataState = Object.create({
    [AUTH_RETURN_DESTINATION_STATE_KEY]: '/decks?filter=due',
  });
  assert.equal(getAuthReturnDestinationFromState(inheritedDataState), DEFAULT_AUTH_RETURN_DESTINATION);

  let inheritedReturnToAccessCount = 0;
  const inheritedState = Object.create({
    get [AUTH_RETURN_DESTINATION_STATE_KEY]() {
      inheritedReturnToAccessCount += 1;
      return '/decks?filter=due';
    },
  });
  assert.equal(getAuthReturnDestinationFromState(inheritedState), DEFAULT_AUTH_RETURN_DESTINATION);
  assert.equal(inheritedReturnToAccessCount, 0);

  const accessorState = {};
  let returnToAccessCount = 0;
  Object.defineProperty(accessorState, AUTH_RETURN_DESTINATION_STATE_KEY, {
    enumerable: true,
    get() {
      returnToAccessCount += 1;
      return '/study';
    },
  });

  assert.equal(getAuthReturnDestinationFromState(accessorState), DEFAULT_AUTH_RETURN_DESTINATION);
  assert.equal(returnToAccessCount, 0);
});
