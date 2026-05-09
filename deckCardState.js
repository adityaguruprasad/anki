function hasSameId(leftId, rightId) {
  return String(leftId) === String(rightId);
}

function incrementCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value + 1 : 1;
}

function isCardCurrentlyDue(card, now = new Date()) {
  const nextReview = card?.next_review;
  if (!nextReview) {
    return true;
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
  incrementDeckCardCounts,
  isCardCurrentlyDue,
  mergeUniqueCards,
};
