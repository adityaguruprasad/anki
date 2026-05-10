function normalizeDeckId(deckId) {
  return String(deckId);
}

function isDeckRemovalInFlight(inFlightDeckRemovals, deckId) {
  return Boolean(inFlightDeckRemovals[normalizeDeckId(deckId)]);
}

function beginDeckRemoval(inFlightDeckRemovals, deckId) {
  const deckKey = normalizeDeckId(deckId);

  if (inFlightDeckRemovals[deckKey]) {
    return false;
  }

  inFlightDeckRemovals[deckKey] = true;
  return true;
}

function clearDeckRemoval(inFlightDeckRemovals, deckId) {
  delete inFlightDeckRemovals[normalizeDeckId(deckId)];
}

module.exports = {
  beginDeckRemoval,
  clearDeckRemoval,
  isDeckRemovalInFlight,
};
