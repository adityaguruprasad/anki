const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { register, login, authenticateToken } = require('./auth');
const { calculateNextReview } = require('./spacedRepetition');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Auth routes
app.post('/api/register', register);
app.post('/api/login', login);

// Protected routes
app.use(authenticateToken);

app.get('/api/decks', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM decks WHERE user_id = $1', [req.user.userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/decks', async (req, res) => {
  const { name } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO decks (user_id, name) VALUES ($1, $2) RETURNING *',
      [req.user.userId, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/cards/:deckId', async (req, res) => {
  try {
    const { deckId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM cards WHERE deck_id = $1 AND next_review <= NOW()',
      [deckId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/study-session', async (req, res) => {
  try {
    const { cardId, quality } = req.body;
    const { rows } = await pool.query('SELECT * FROM cards WHERE id = $1', [cardId]);
    const card = rows[0];

    const { ease_factor, interval, next_review } = calculateNextReview(card, quality);

    await pool.query(
      'UPDATE cards SET last_reviewed = NOW(), next_review = $1, interval = $2, ease_factor = $3, review_count = review_count + 1 WHERE id = $4',
      [next_review, interval, ease_factor, cardId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalCards = await pool.query('SELECT COUNT(*) FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1)', [req.user.userId]);
    const totalDecks = await pool.query('SELECT COUNT(*) FROM decks WHERE user_id = $1', [req.user.userId]);
    const todayReviews = await pool.query('SELECT COUNT(*) FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1) AND last_reviewed >= CURRENT_DATE', [req.user.userId]);
    const weekReviews = await pool.query('SELECT COUNT(*) FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1) AND last_reviewed >= CURRENT_DATE - INTERVAL \'7 days\'', [req.user.userId]);
    const monthReviews = await pool.query('SELECT COUNT(*) FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1) AND last_reviewed >= CURRENT_DATE - INTERVAL \'30 days\'', [req.user.userId]);

    res.json({
      totalCards: totalCards.rows[0].count,
      totalDecks: totalDecks.rows[0].count,
      todayReviews: todayReviews.rows[0].count,
      weekReviews: weekReviews.rows[0].count,
      monthReviews: monthReviews.rows[0].count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});