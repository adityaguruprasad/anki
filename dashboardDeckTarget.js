function hasNonNegativeSafeIntegerCount(deck, key) {
  return Boolean(deck) && Number.isSafeInteger(deck[key]) && deck[key] >= 0;
}

function hasPositiveSafeIntegerCount(deck, key) {
  return hasNonNegativeSafeIntegerCount(deck, key) && deck[key] > 0;
}

function hasUsableDeckId(deck) {
  if (!deck) {
    return false;
  }

  if (typeof deck.id === 'string') {
    return deck.id.trim().length > 0;
  }

  return typeof deck.id === 'number' && Number.isFinite(deck.id);
}

function hasDashboardDeckListPayload(decks) {
  return Array.isArray(decks)
    && decks.every((deck) => (
      deck
      && typeof deck === 'object'
      && !Array.isArray(deck)
      && hasUsableDeckId(deck)
      && hasNonNegativeSafeIntegerCount(deck, 'totalCards')
      && hasNonNegativeSafeIntegerCount(deck, 'dueCards')
    ));
}

function hasDueCards(deck) {
  return hasPositiveSafeIntegerCount(deck, 'dueCards');
}

function selectStudyDeckTarget(decks) {
  if (!Array.isArray(decks)) {
    return null;
  }

  return (
    decks.find(hasDueCards) ||
    decks.find((deck) => hasPositiveSafeIntegerCount(deck, 'totalCards')) ||
    null
  );
}

function getStudyDeckTargetPath(deck) {
  if (hasDueCards(deck)) {
    return `/study?deckId=${encodeURIComponent(deck.id)}`;
  }

  return '/decks';
}

module.exports = {
  getStudyDeckTargetPath,
  hasDashboardDeckListPayload,
  hasDueCards,
  selectStudyDeckTarget,
};
