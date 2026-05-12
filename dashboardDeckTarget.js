function hasNonNegativeSafeIntegerCount(deck, key) {
  return Boolean(deck) && Number.isSafeInteger(deck[key]) && deck[key] >= 0;
}

function hasPositiveSafeIntegerCount(deck, key) {
  return hasNonNegativeSafeIntegerCount(deck, key) && deck[key] > 0;
}

const MAX_SAFE_INTEGER_STRING = String(Number.MAX_SAFE_INTEGER);

function normalizeStudyDeckId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const normalized = trimmed.replace(/^0+/, '');
  const candidate = normalized || '0';

  if (
    !/^\d+$/.test(trimmed)
    || candidate === '0'
    || candidate.length > MAX_SAFE_INTEGER_STRING.length
    || (
      candidate.length === MAX_SAFE_INTEGER_STRING.length
      && candidate > MAX_SAFE_INTEGER_STRING
    )
  ) {
    return null;
  }

  return candidate;
}

function hasUsableDeckId(deck) {
  return Boolean(deck) && normalizeStudyDeckId(deck.id) !== null;
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

function selectDeckWithMostDueCards(decks) {
  let selectedDeck = null;

  for (const deck of decks) {
    if (!hasUsableDeckId(deck) || !hasDueCards(deck)) {
      continue;
    }

    if (!selectedDeck || deck.dueCards > selectedDeck.dueCards) {
      selectedDeck = deck;
    }
  }

  return selectedDeck;
}

function selectStudyDeckTarget(decks) {
  if (!Array.isArray(decks)) {
    return null;
  }

  return (
    selectDeckWithMostDueCards(decks) ||
    decks.find((deck) => (
      hasUsableDeckId(deck)
      && hasPositiveSafeIntegerCount(deck, 'totalCards')
    )) ||
    null
  );
}

function getStudyDeckTargetPath(deck) {
  const deckId = deck ? normalizeStudyDeckId(deck.id) : null;

  if (deckId && hasDueCards(deck)) {
    return `/study?deckId=${encodeURIComponent(deckId)}`;
  }

  return '/decks';
}

module.exports = {
  getStudyDeckTargetPath,
  hasDashboardDeckListPayload,
  hasDueCards,
  selectStudyDeckTarget,
};
