function hasPositiveNumericCount(deck, key) {
  return deck && typeof deck[key] === 'number' && Number.isFinite(deck[key]) && deck[key] > 0;
}

function hasDueCards(deck) {
  return hasPositiveNumericCount(deck, 'dueCards');
}

function selectStudyDeckTarget(decks) {
  if (!Array.isArray(decks)) {
    return null;
  }

  return (
    decks.find(hasDueCards) ||
    decks.find((deck) => hasPositiveNumericCount(deck, 'totalCards')) ||
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
  hasDueCards,
  selectStudyDeckTarget,
};
