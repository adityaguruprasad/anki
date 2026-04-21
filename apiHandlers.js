const { validateDeckName } = require('./deckNameValidation');

function isValidQuality(quality) {
  return Number.isInteger(quality) && quality >= 0 && quality <= 5;
}

async function getDueCardsByDeck(req, res, db) {
  try {
    const { deckId } = req.params;
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
    if (!isValidQuality(quality)) {
      return res.status(400).json({ error: 'Invalid quality: must be an integer between 0 and 5' });
    }

    const cardResult = await db.query(
      `SELECT c.*
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1 AND d.user_id = $2`,
      [cardId, req.user.userId]
    );
    if (cardResult.rowCount === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = cardResult.rows[0];
    const { ease_factor, interval, next_review } = calculateNextReview(card, quality);

    await db.query(
      'UPDATE cards SET last_reviewed = NOW(), next_review = $1, interval = $2, ease_factor = $3, review_count = review_count + 1 WHERE id = $4',
      [next_review, interval, ease_factor, cardId]
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

module.exports = {
  createDeck,
  getDueCardsByDeck,
  submitStudySession,
  isValidQuality,
};
