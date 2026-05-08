const { validateDeckName } = require('./deckNameValidation');

function isValidQuality(quality) {
  return Number.isInteger(quality) && quality >= 0 && quality <= 5;
}

function validatePositiveIntegerIdentifier(value, fieldName) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) {
      return { ok: true, value };
    }
    return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = BigInt(trimmed);
      if (parsed > 0n && parsed <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return { ok: true, value: Number(parsed) };
      }
    }
  }

  return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
}

function toAggregateCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function toNullableAggregateNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateCardContent(value, fieldName) {
  if (typeof value !== 'string') {
    return { ok: false, error: `Invalid ${fieldName}: must be a non-empty string` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `Invalid ${fieldName}: must be a non-empty string` };
  }

  return { ok: true, value: trimmed };
}

// Stats and scheduling buckets intentionally use the Node process local timezone;
// keep Node TZ aligned with the database/session timezone for timestamp columns.
function startOfLocalDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addLocalDays(date, days) {
  const day = new Date(date);
  day.setDate(day.getDate() + days);
  return day;
}

function getSchedulingInsightDateBoundaries(now = new Date()) {
  // Preserve the previous app-local day bucketing for scheduling insights.
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addLocalDays(todayStart, 1);
  const afterTomorrowStart = addLocalDays(todayStart, 2);
  const sevenDayEndExclusive = addLocalDays(todayStart, 7);

  return {
    todayStart,
    tomorrowStart,
    afterTomorrowStart,
    sevenDayEndExclusive,
  };
}

async function getDueCardsByDeck(req, res, db) {
  try {
    const deckIdValidation = validatePositiveIntegerIdentifier(req.params?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const deckId = deckIdValidation.value;
    const { rows } = await db.query(
      `SELECT c.*, d.id AS "__owned_deck_id"
       FROM decks d
       LEFT JOIN cards c
         ON c.deck_id = d.id
        AND c.next_review <= NOW()
       WHERE d.id = $1 AND d.user_id = $2
       ORDER BY c.next_review ASC, c.id ASC`,
      [deckId, req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found for user' });
    }

    const dueCards = rows
      .filter((row) => row.id !== null)
      .map((row) => {
        const card = { ...row };
        delete card.__owned_deck_id;
        return card;
      });
    return res.json(dueCards);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createCard(req, res, db) {
  try {
    const deckIdValidation = validatePositiveIntegerIdentifier(req.body?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const frontContentValidation = validateCardContent(req.body?.frontContent, 'frontContent');
    if (!frontContentValidation.ok) {
      return res.status(400).json({ error: frontContentValidation.error });
    }

    const backContentValidation = validateCardContent(req.body?.backContent, 'backContent');
    if (!backContentValidation.ok) {
      return res.status(400).json({ error: backContentValidation.error });
    }

    const { rows } = await db.query(
      `INSERT INTO cards (
         deck_id,
         front_content,
         back_content,
         next_review,
         interval,
         ease_factor,
         review_count
       )
       SELECT d.id, $3, $4, NOW(), 1, 2.5, 0
       FROM decks d
       WHERE d.id = $1 AND d.user_id = $2
       RETURNING *`,
      [
        deckIdValidation.value,
        req.user.userId,
        frontContentValidation.value,
        backContentValidation.value,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function submitStudySession(req, res, db, calculateNextReview) {
  try {
    const { cardId, quality } = req.body;
    const cardIdValidation = validatePositiveIntegerIdentifier(cardId, 'cardId');
    if (!cardIdValidation.ok) {
      return res.status(400).json({ error: cardIdValidation.error });
    }

    const validCardId = cardIdValidation.value;
    if (!isValidQuality(quality)) {
      return res.status(400).json({ error: 'Invalid quality: must be an integer between 0 and 5' });
    }

    const cardResult = await db.query(
      `SELECT c.*
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1 AND d.user_id = $2`,
      [validCardId, req.user.userId]
    );
    if (cardResult.rowCount === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = cardResult.rows[0];
    const { ease_factor, interval, next_review } = calculateNextReview(card, quality);

    const updateResult = await db.query(
      `UPDATE cards
       SET last_reviewed = NOW(),
           next_review = $1,
           interval = $2,
           ease_factor = $3,
           review_count = review_count + 1
       WHERE id = $4
         AND EXISTS (
           SELECT 1
           FROM decks d
           WHERE d.id = cards.deck_id
             AND d.user_id = $5
         )`,
      [next_review, interval, ease_factor, validCardId, req.user.userId]
    );
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createDeck(req, res, db) {
  try {
    const validationResult = validateDeckName(req.body?.name);
    if (!validationResult.ok) {
      return res.status(400).json({ error: validationResult.error });
    }

    const deckName = validationResult.value;
    const { rows } = await db.query(
      `INSERT INTO decks (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, (LOWER(TRIM(name)))) DO NOTHING
       RETURNING *`,
      [req.user.userId, deckName]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDecks(req, res, db) {
  try {
    const { rows } = await db.query(
      `SELECT
         d.*,
         COUNT(c.id) AS "totalCards",
         COUNT(c.id) FILTER (WHERE c.next_review <= NOW()) AS "dueCards"
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC, d.id DESC`,
      [req.user.userId]
    );

    return res.json(rows.map((deck) => ({
      ...deck,
      totalCards: toAggregateCount(deck.totalCards),
      dueCards: toAggregateCount(deck.dueCards),
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getStats(req, res, db, now = new Date()) {
  try {
    const todayStart = startOfLocalDay(now);
    const tomorrowStart = addLocalDays(todayStart, 1);
    const sevenDayLookbackStart = addLocalDays(todayStart, -7);
    const thirtyDayLookbackStart = addLocalDays(todayStart, -30);

    const { rows } = await db.query(
      `SELECT
         COUNT(c.id) AS "totalCards",
         COUNT(DISTINCT d.id) AS "totalDecks",
         COUNT(c.id) FILTER (
           WHERE c.last_reviewed >= $2
             AND c.last_reviewed < $3
         ) AS "todayReviews",
         COUNT(c.id) FILTER (
           WHERE c.last_reviewed >= $4
             AND c.last_reviewed < $3
         ) AS "weekReviews",
         COUNT(c.id) FILTER (
           WHERE c.last_reviewed >= $5
             AND c.last_reviewed < $3
         ) AS "monthReviews"
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = $1`,
      [req.user.userId, todayStart, tomorrowStart, sevenDayLookbackStart, thirtyDayLookbackStart]
    );

    const stats = rows[0] ?? {};
    return res.json({
      totalCards: toAggregateCount(stats.totalCards),
      totalDecks: toAggregateCount(stats.totalDecks),
      todayReviews: toAggregateCount(stats.todayReviews),
      weekReviews: toAggregateCount(stats.weekReviews),
      monthReviews: toAggregateCount(stats.monthReviews),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSchedulingInsights(req, res, db, now = new Date()) {
  try {
    const {
      todayStart,
      tomorrowStart,
      afterTomorrowStart,
      sevenDayEndExclusive,
    } = getSchedulingInsightDateBoundaries(now);

    const { rows } = await db.query(
      `SELECT
         COUNT(c.id) AS "totalCards",
         COUNT(c.id) FILTER (WHERE c.next_review < $2) AS "overdue",
         COUNT(c.id) FILTER (
           WHERE c.next_review >= $2
             AND c.next_review < $3
         ) AS "dueToday",
         COUNT(c.id) FILTER (
           WHERE c.next_review >= $3
             AND c.next_review < $4
         ) AS "dueTomorrow",
         COUNT(c.id) FILTER (
           WHERE c.next_review >= $2
             AND c.next_review < $5
         ) AS "dueNext7Days",
         COUNT(c.id) FILTER (
           WHERE c.ease_factor > 0
             AND c.ease_factor <= 1.6
             AND COALESCE(c.review_count, 0) >= 5
         ) AS "leechCandidates",
         ROUND((AVG(c.ease_factor) FILTER (WHERE c.ease_factor > 0))::numeric, 2) AS "averageEaseFactor"
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = $1`,
      [req.user.userId, todayStart, tomorrowStart, afterTomorrowStart, sevenDayEndExclusive]
    );

    const stats = rows[0] ?? {};
    const overdue = toAggregateCount(stats.overdue);
    const dueToday = toAggregateCount(stats.dueToday);
    const focusLoad = overdue + dueToday;
    const averageEaseFactor = toNullableAggregateNumber(stats.averageEaseFactor);

    return res.json({
      totalCards: toAggregateCount(stats.totalCards),
      overdue,
      dueToday,
      dueTomorrow: toAggregateCount(stats.dueTomorrow),
      dueNext7Days: toAggregateCount(stats.dueNext7Days),
      leechCandidates: toAggregateCount(stats.leechCandidates),
      averageEaseFactor,
      recommendedDailyReviewTarget: Math.max(10, Math.ceil(focusLoad * 1.2)),
      suggestedNewCards: Math.max(0, 20 - focusLoad),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createCard,
  createDeck,
  getDecks,
  getStats,
  getSchedulingInsights,
  getDueCardsByDeck,
  submitStudySession,
  isValidQuality,
  validatePositiveIntegerIdentifier,
};
