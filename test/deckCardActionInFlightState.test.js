const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CARD_ACTIONS,
  beginCardRemove,
  beginCardSave,
  clearCardAction,
  isCardActionInFlight,
} = require('../deckCardActionInFlightState');

test('beginCardSave is blocked while the card has an in-flight action', () => {
  const inFlightCards = {};

  assert.equal(beginCardSave(inFlightCards, 1), true);
  assert.equal(beginCardSave(inFlightCards, 1), false);
  assert.deepEqual(inFlightCards, { 1: CARD_ACTIONS.SAVE });
});

test('beginCardRemove is blocked while the card has an in-flight action', () => {
  const inFlightCards = {};

  assert.equal(beginCardRemove(inFlightCards, 2), true);
  assert.equal(beginCardRemove(inFlightCards, 2), false);
  assert.deepEqual(inFlightCards, { 2: CARD_ACTIONS.REMOVE });
});

test('save and remove actions are mutually exclusive for the same card', () => {
  const savingCard = {};
  const removingCard = {};

  assert.equal(beginCardSave(savingCard, 3), true);
  assert.equal(beginCardRemove(savingCard, 3), false);
  assert.deepEqual(savingCard, { 3: CARD_ACTIONS.SAVE });

  assert.equal(beginCardRemove(removingCard, 4), true);
  assert.equal(beginCardSave(removingCard, 4), false);
  assert.deepEqual(removingCard, { 4: CARD_ACTIONS.REMOVE });
});

test('save and remove actions both mark the chosen card in-flight', () => {
  const inFlightCards = {};

  assert.equal(beginCardSave(inFlightCards, 5), true);
  assert.equal(beginCardRemove(inFlightCards, 6), true);
  assert.equal(isCardActionInFlight(inFlightCards, 5), true);
  assert.equal(isCardActionInFlight(inFlightCards, 6), true);
});

test('clearCardAction only clears the chosen card', () => {
  const inFlightCards = {};

  beginCardSave(inFlightCards, 7);
  beginCardRemove(inFlightCards, 8);

  clearCardAction(inFlightCards, 7);

  assert.equal(isCardActionInFlight(inFlightCards, 7), false);
  assert.equal(isCardActionInFlight(inFlightCards, 8), true);
  assert.deepEqual(inFlightCards, { 8: CARD_ACTIONS.REMOVE });
});

test('card ids are compared robustly across string and number forms', () => {
  const inFlightCards = {};

  assert.equal(beginCardSave(inFlightCards, 9), true);
  assert.equal(isCardActionInFlight(inFlightCards, '9'), true);
  assert.equal(beginCardRemove(inFlightCards, '9'), false);

  clearCardAction(inFlightCards, '9');

  assert.equal(isCardActionInFlight(inFlightCards, 9), false);
  assert.equal(beginCardRemove(inFlightCards, '9'), true);
  assert.equal(isCardActionInFlight(inFlightCards, 9), true);
});
