const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  d.setMilliseconds(d.getMilliseconds() - 1);
  return d;
};

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildSchedulingInsights = (cards, now = new Date()) => {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const tomorrowEnd = endOfDay(tomorrowStart);
  const sevenDayEnd = endOfDay(new Date(todayStart.getTime() + (6 * DAY_MS)));

  let overdue = 0;
  let dueToday = 0;
  let dueTomorrow = 0;
  let dueNext7Days = 0;

  let easeFactorSum = 0;
  let easeFactorCount = 0;
  let leechCandidates = 0;

  cards.forEach((card) => {
    const nextReview = toValidDate(card.next_review);
    if (nextReview) {
      if (nextReview < todayStart) overdue += 1;
      if (nextReview >= todayStart && nextReview <= todayEnd) dueToday += 1;
      if (nextReview >= tomorrowStart && nextReview <= tomorrowEnd) dueTomorrow += 1;
      if (nextReview >= todayStart && nextReview <= sevenDayEnd) dueNext7Days += 1;
    }

    const easeFactor = Number(card.ease_factor);
    if (!Number.isNaN(easeFactor) && easeFactor > 0) {
      easeFactorSum += easeFactor;
      easeFactorCount += 1;

      const reviewCount = Number(card.review_count || 0);
      if (easeFactor <= 1.6 && reviewCount >= 5) {
        leechCandidates += 1;
      }
    }
  });

  const averageEaseFactor = easeFactorCount > 0 ? Number((easeFactorSum / easeFactorCount).toFixed(2)) : null;
  const focusLoad = overdue + dueToday;
  const recommendedDailyReviewTarget = Math.max(10, Math.ceil(focusLoad * 1.2));
  const suggestedNewCards = Math.max(0, 20 - focusLoad);

  return {
    totalCards: cards.length,
    overdue,
    dueToday,
    dueTomorrow,
    dueNext7Days,
    leechCandidates,
    averageEaseFactor,
    recommendedDailyReviewTarget,
    suggestedNewCards,
  };
};

module.exports = {
  buildSchedulingInsights,
};
