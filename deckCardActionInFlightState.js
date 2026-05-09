const CARD_ACTIONS = Object.freeze({
  SAVE: 'save',
  REMOVE: 'remove',
});

function normalizeCardId(cardId) {
  return String(cardId);
}

function isCardActionInFlight(inFlightCards, cardId) {
  return Boolean(inFlightCards[normalizeCardId(cardId)]);
}

function beginCardAction(inFlightCards, cardId, action) {
  const cardKey = normalizeCardId(cardId);

  if (inFlightCards[cardKey]) {
    return false;
  }

  inFlightCards[cardKey] = action;
  return true;
}

function beginCardSave(inFlightCards, cardId) {
  return beginCardAction(inFlightCards, cardId, CARD_ACTIONS.SAVE);
}

function beginCardRemove(inFlightCards, cardId) {
  return beginCardAction(inFlightCards, cardId, CARD_ACTIONS.REMOVE);
}

function clearCardAction(inFlightCards, cardId) {
  delete inFlightCards[normalizeCardId(cardId)];
}

module.exports = {
  CARD_ACTIONS,
  beginCardRemove,
  beginCardSave,
  clearCardAction,
  isCardActionInFlight,
};
