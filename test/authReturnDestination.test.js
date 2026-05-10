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
