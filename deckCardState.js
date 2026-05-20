const { isValidIsoTimestamp } = require('./isoTimestampValidation');

function hasSameId(leftId, rightId) {
  return String(leftId) === String(rightId);
}

function incrementCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value + 1 : 1;
}

function decrementCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(value - 1, 0) : 0;
}

function hasSchedulingMetadata(card) {
  return card !== null
    && typeof card === 'object'
    && !Array.isArray(card)
    && Object.prototype.hasOwnProperty.call(card, 'next_review');
}

function isCardCurrentlyDue(card, now = new Date()) {
  if (!hasSchedulingMetadata(card)) {
    return false;
  }

  const nextReview = card?.next_review;
  if (nextReview === null) {
    return true;
  }

  if (!isValidIsoTimestamp(nextReview)) {
    return false;
  }

  const nextReviewTime = new Date(nextReview).getTime();
  const nowTime = new Date(now).getTime();
  return Number.isFinite(nextReviewTime) && Number.isFinite(nowTime) && nextReviewTime <= nowTime;
}

function incrementDeckCardCounts(decks, deckId, createdCard, now = new Date()) {
  const dueIncrement = isCardCurrentlyDue(createdCard, now) ? 1 : 0;

  return decks.map((deck) => {
    if (!hasSameId(deck.id, deckId)) {
      return deck;
    }

    return {
      ...deck,
      totalCards: incrementCount(deck.totalCards),
      dueCards: dueIncrement ? incrementCount(deck.dueCards) : deck.dueCards,
    };
  });
}

function decrementDeckCardCounts(decks, deckId, removedCard, now = new Date()) {
  const dueDecrement = isCardCurrentlyDue(removedCard, now) ? 1 : 0;

  return decks.map((deck) => {
    if (!hasSameId(deck.id, deckId)) {
      return deck;
    }

    return {
      ...deck,
      totalCards: decrementCount(deck.totalCards),
      dueCards: dueDecrement ? decrementCount(deck.dueCards) : deck.dueCards,
    };
  });
}

function mergeUniqueCards(existingCards, nextCards) {
  const existingIds = new Set(existingCards.map((card) => String(card.id)));
  const uniqueNextCards = nextCards.filter((card) => !existingIds.has(String(card.id)));
  return [...existingCards, ...uniqueNextCards];
}

function prependUniqueCard(existingCards, createdCard) {
  return [
    createdCard,
    ...existingCards.filter((card) => !hasSameId(card.id, createdCard.id)),
  ];
}

function addCreatedCardToLoadedDeckCards(deckCards, deckId, createdCard) {
  const currentDeckCards = deckCards[deckId];
  if (!currentDeckCards?.hasLoaded || (currentDeckCards.appliedSearchQuery || '').trim()) {
    return deckCards;
  }

  return {
    ...deckCards,
    [deckId]: {
      ...currentDeckCards,
      cards: prependUniqueCard(currentDeckCards.cards || [], createdCard),
    },
  };
}

module.exports = {
  addCreatedCardToLoadedDeckCards,
  decrementDeckCardCounts,
  incrementDeckCardCounts,
  isCardCurrentlyDue,
  mergeUniqueCards,
};
