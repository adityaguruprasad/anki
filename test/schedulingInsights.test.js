const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSchedulingInsights } = require('../schedulingInsights');

test('buildSchedulingInsights computes scheduling pressure and suggestions', () => {
  const now = new Date('2026-04-20T12:00:00.000Z');

  const cards = [
    { next_review: '2026-04-19T10:00:00.000Z', ease_factor: 1.4, review_count: 8 }, // overdue + leech
    { next_review: '2026-04-20T18:00:00.000Z', ease_factor: 2.5, review_count: 4 }, // today
    { next_review: '2026-04-21T09:00:00.000Z', ease_factor: 2.3, review_count: 2 }, // tomorrow
    { next_review: '2026-04-26T09:00:00.000Z', ease_factor: 2.1, review_count: 3 }, // within 7 days
    { next_review: '2026-05-05T09:00:00.000Z', ease_factor: 2.0, review_count: 1 }, // outside 7 days
  ];

  const insights = buildSchedulingInsights(cards, now);

  assert.equal(insights.totalCards, 5);
  assert.equal(insights.overdue, 1);
  assert.equal(insights.dueToday, 1);
  assert.equal(insights.dueTomorrow, 1);
  assert.equal(insights.dueNext7Days, 3);
  assert.equal(insights.leechCandidates, 1);
  assert.equal(insights.averageEaseFactor, 2.06);
  assert.equal(insights.recommendedDailyReviewTarget, 10);
  assert.equal(insights.suggestedNewCards, 18);
});

test('buildSchedulingInsights handles empty cards safely', () => {
  const insights = buildSchedulingInsights([], new Date('2026-04-20T12:00:00.000Z'));

  assert.equal(insights.totalCards, 0);
  assert.equal(insights.overdue, 0);
  assert.equal(insights.dueToday, 0);
  assert.equal(insights.dueTomorrow, 0);
  assert.equal(insights.dueNext7Days, 0);
  assert.equal(insights.leechCandidates, 0);
  assert.equal(insights.averageEaseFactor, null);
  assert.equal(insights.recommendedDailyReviewTarget, 10);
  assert.equal(insights.suggestedNewCards, 20);
});
