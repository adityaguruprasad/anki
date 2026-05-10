function hasSameDeckId(leftId, rightId) {
  return String(leftId) === String(rightId);
}

function isDeckObject(deck) {
  return deck !== null && typeof deck === 'object' && deck.id !== undefined && deck.id !== null;
}

function getUsableDeckName(deck, fallbackName = '') {
  if (typeof deck?.name === 'string' && deck.name.trim()) {
    return deck.name;
  }

  if (typeof fallbackName === 'string' && fallbackName.trim()) {
    return fallbackName;
  }

  return '';
}

function normalizeDeckCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeCreatedDeck(createdDeck, fallbackName = '') {
  if (!isDeckObject(createdDeck)) {
    return null;
  }

  const name = getUsableDeckName(createdDeck, fallbackName);
  if (!name) {
    return null;
  }

  return {
    ...createdDeck,
    name,
    totalCards: normalizeDeckCount(createdDeck.totalCards),
    dueCards: normalizeDeckCount(createdDeck.dueCards),
  };
}

function addCreatedDeck(decks, createdDeck, fallbackName = '') {
  const normalizedDeck = normalizeCreatedDeck(createdDeck, fallbackName);
  if (!normalizedDeck) {
    return decks;
  }

  return [
    normalizedDeck,
    ...decks.filter((deck) => !hasSameDeckId(deck.id, normalizedDeck.id)),
  ];
}

function mergeRenamedDeck(decks, deckId, renamedDeck, fallbackName = '') {
  const hasMatchingResponse = isDeckObject(renamedDeck) && hasSameDeckId(renamedDeck.id, deckId);
  const name = getUsableDeckName(hasMatchingResponse ? renamedDeck : null, fallbackName);
  if (!name) {
    return decks;
  }

  let didUpdate = false;
  const responsePatch = hasMatchingResponse ? renamedDeck : {};

  const nextDecks = decks.map((deck) => {
    if (!hasSameDeckId(deck.id, deckId)) {
      return deck;
    }

    didUpdate = true;
    return {
      ...deck,
      ...responsePatch,
      id: deck.id,
      name,
    };
  });

  return didUpdate ? nextDecks : decks;
}

function removeDeckFromList(decks, deckId) {
  const nextDecks = decks.filter((deck) => !hasSameDeckId(deck.id, deckId));
  return nextDecks.length === decks.length ? decks : nextDecks;
}

module.exports = {
  addCreatedDeck,
  mergeRenamedDeck,
  removeDeckFromList,
};
