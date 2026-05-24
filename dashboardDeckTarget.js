const { MAX_POSTGRES_SERIAL_ID } = require('./cardIdentifier');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

const MAX_POSTGRES_SERIAL_ID_STRING = String(MAX_POSTGRES_SERIAL_ID);

function hasNonNegativeSafeIntegerCount(deck, key) {
  const count = getOwnDataPropertyValue(deck, key);

  return Number.isSafeInteger(count) && count >= 0;
}

function hasPositiveSafeIntegerCount(deck, key) {
  const count = getOwnDataPropertyValue(deck, key);

  return Number.isSafeInteger(count) && count > 0;
}

function hasConsistentDeckCounts(deck) {
  const totalCards = getOwnDataPropertyValue(deck, 'totalCards');
  const dueCards = getOwnDataPropertyValue(deck, 'dueCards');

  return Number.isSafeInteger(totalCards)
    && totalCards >= 0
    && Number.isSafeInteger(dueCards)
    && dueCards >= 0
    && dueCards <= totalCards;
}

// Returns the canonical positive PostgreSQL SERIAL deck id string used in study routes.
function normalizeStudyDeckId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_POSTGRES_SERIAL_ID
      ? String(value)
      : null;
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
    || candidate.length > MAX_POSTGRES_SERIAL_ID_STRING.length
    || (
      candidate.length === MAX_POSTGRES_SERIAL_ID_STRING.length
      && candidate > MAX_POSTGRES_SERIAL_ID_STRING
    )
  ) {
    return null;
  }

  return candidate;
}

function hasUsableDeckId(deck) {
  return normalizeStudyDeckId(getOwnDataPropertyValue(deck, 'id')) !== null;
}

function hasDashboardDeckListPayload(decks) {
  return Array.isArray(decks)
    && decks.every((deck) => (
      isObjectRecord(deck)
      && hasUsableDeckId(deck)
      && hasConsistentDeckCounts(deck)
    ));
}

function hasDueCards(deck) {
  return hasConsistentDeckCounts(deck) && hasPositiveSafeIntegerCount(deck, 'dueCards');
}

function selectDeckWithMostDueCards(decks) {
  let selectedDeck = null;

  for (const deck of decks) {
    if (!hasUsableDeckId(deck) || !hasDueCards(deck)) {
      continue;
    }

    const dueCards = getOwnDataPropertyValue(deck, 'dueCards');
    const selectedDueCards = selectedDeck
      ? getOwnDataPropertyValue(selectedDeck, 'dueCards')
      : null;

    if (!selectedDeck || dueCards > selectedDueCards) {
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
      && hasConsistentDeckCounts(deck)
      && hasPositiveSafeIntegerCount(deck, 'totalCards')
    )) ||
    null
  );
}

function getStudyDeckTargetPath(deck) {
  const deckId = normalizeStudyDeckId(getOwnDataPropertyValue(deck, 'id'));

  if (deckId && hasDueCards(deck)) {
    return `/study?deckId=${encodeURIComponent(deckId)}`;
  }

  return '/decks';
}

module.exports = {
  getStudyDeckTargetPath,
  hasDashboardDeckListPayload,
  hasDueCards,
  normalizeStudyDeckId,
  selectStudyDeckTarget,
};
