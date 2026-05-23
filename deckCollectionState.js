function hasSameDeckId(leftId, rightId) {
  return String(leftId) === String(rightId);
}

function isObjectRecord(value) {
  return value !== null && typeof value === 'object';
}

function descriptorHasValue(descriptor) {
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
}

function getOwnDataPropertyValue(value, key) {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptorHasValue(descriptor) ? descriptor.value : undefined;
}

function getOwnEnumerableDataProperties(value) {
  if (!isObjectRecord(value)) {
    return {};
  }

  const properties = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptorHasValue(descriptor) || !descriptor.enumerable) {
      continue;
    }

    // Define descriptor values directly so keys like __proto__ cannot invoke setters.
    Object.defineProperty(properties, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return properties;
}

function isDeckObject(deck) {
  const id = getOwnDataPropertyValue(deck, 'id');
  return id !== undefined && id !== null;
}

function getUsableDeckName(deck, fallbackName = '') {
  const name = getOwnDataPropertyValue(deck, 'name');
  if (typeof name === 'string' && name.trim()) {
    return name;
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
    ...getOwnEnumerableDataProperties(createdDeck),
    name,
    totalCards: normalizeDeckCount(getOwnDataPropertyValue(createdDeck, 'totalCards')),
    dueCards: normalizeDeckCount(getOwnDataPropertyValue(createdDeck, 'dueCards')),
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
  const renamedDeckId = getOwnDataPropertyValue(renamedDeck, 'id');
  const hasMatchingResponse = renamedDeckId !== undefined
    && renamedDeckId !== null
    && hasSameDeckId(renamedDeckId, deckId);
  const name = getUsableDeckName(hasMatchingResponse ? renamedDeck : null, fallbackName);
  if (!name) {
    return decks;
  }

  let didUpdate = false;
  const responsePatch = hasMatchingResponse ? getOwnEnumerableDataProperties(renamedDeck) : {};

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
