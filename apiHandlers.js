const { validateDeckName } = require('./deckNameValidation');

function isValidQuality(quality) {
  return Number.isInteger(quality) && quality >= 0 && quality <= 5;
}

function validatePositiveIntegerIdentifier(value, fieldName) {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0) {
      return { ok: true, value };
    }
    return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (parsed > 0) {
        return { ok: true, value: parsed };
      }
    }
  }

  return { ok: false, error: `Invalid ${fieldName}: must be a positive integer` };
}

function toAggregateCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

async function getDueCardsByDeck(req, res, db) {
  try {
    const deckIdValidation = validatePositiveIntegerIdentifier(req.params?.deckId, 'deckId');
    if (!deckIdValidation.ok) {
      return res.status(400).json({ error: deckIdValidation.error });
    }

    const deckId = deckIdValidation.value;
    const deckResult = await db.query(
      'SELECT id FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.userId]
    );

    if (deckResult.rowCount === 0) {
      return res.status(404).json({ error: 'Deck not found for user' });
    }

    const { rows } = await db.query(
      `SELECT c.*
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE c.deck_id = $1 AND d.user_id = $2 AND c.next_review <= NOW()`,
      [deckId, req.user.userId]
    );
    return res.json(rows);
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

    await db.query(
      'UPDATE cards SET last_reviewed = NOW(), next_review = $1, interval = $2, ease_factor = $3, review_count = review_count + 1 WHERE id = $4',
      [next_review, interval, ease_factor, validCardId]
    );

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
    const duplicateResult = await db.query(
      'SELECT id FROM decks WHERE user_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
      [req.user.userId, deckName]
    );

    if (duplicateResult.rowCount > 0) {
      return res.status(409).json({ error: 'Deck name already exists for this user' });
    }

    const { rows } = await db.query(
      'INSERT INTO decks (user_id, name) VALUES ($1, $2) RETURNING *',
      [req.user.userId, deckName]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getStats(req, res, db) {
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(c.id) AS "totalCards",
         COUNT(DISTINCT d.id) AS "totalDecks",
         COUNT(c.id) FILTER (WHERE c.last_reviewed >= CURRENT_DATE) AS "todayReviews",
         COUNT(c.id) FILTER (WHERE c.last_reviewed >= CURRENT_DATE - INTERVAL '7 days') AS "weekReviews",
         COUNT(c.id) FILTER (WHERE c.last_reviewed >= CURRENT_DATE - INTERVAL '30 days') AS "monthReviews"
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = $1`,
      [req.user.userId]
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

module.exports = {
  createDeck,
  getStats,
  getDueCardsByDeck,
  submitStudySession,
  isValidQuality,
  validatePositiveIntegerIdentifier,
};
