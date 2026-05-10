const test = require('node:test');
const assert = require('node:assert/strict');

const {
  beginDeckRemoval,
  clearDeckRemoval,
  isDeckRemovalInFlight,
} = require('../deckRemovalInFlightState');

test('beginDeckRemoval blocks duplicate in-flight removals for the same deck', () => {
  const inFlightDeckRemovals = {};

  assert.equal(beginDeckRemoval(inFlightDeckRemovals, 1), true);
  assert.equal(beginDeckRemoval(inFlightDeckRemovals, 1), false);
  assert.equal(isDeckRemovalInFlight(inFlightDeckRemovals, 1), true);
  assert.deepEqual(inFlightDeckRemovals, { 1: true });
});

test('clearDeckRemoval only clears the chosen deck removal', () => {
  const inFlightDeckRemovals = {};

  beginDeckRemoval(inFlightDeckRemovals, 2);
  beginDeckRemoval(inFlightDeckRemovals, 3);

  clearDeckRemoval(inFlightDeckRemovals, 2);

  assert.equal(isDeckRemovalInFlight(inFlightDeckRemovals, 2), false);
  assert.equal(isDeckRemovalInFlight(inFlightDeckRemovals, 3), true);
  assert.deepEqual(inFlightDeckRemovals, { 3: true });
});

test('deck ids are compared robustly across string and number forms', () => {
  const inFlightDeckRemovals = {};

  assert.equal(beginDeckRemoval(inFlightDeckRemovals, 4), true);
  assert.equal(isDeckRemovalInFlight(inFlightDeckRemovals, '4'), true);
  assert.equal(beginDeckRemoval(inFlightDeckRemovals, '4'), false);

  clearDeckRemoval(inFlightDeckRemovals, '4');

  assert.equal(isDeckRemovalInFlight(inFlightDeckRemovals, 4), false);
  assert.equal(beginDeckRemoval(inFlightDeckRemovals, '4'), true);
  assert.equal(isDeckRemovalInFlight(inFlightDeckRemovals, 4), true);
  assert.deepEqual(inFlightDeckRemovals, { 4: true });
});
