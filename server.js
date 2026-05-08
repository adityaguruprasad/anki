const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { register, login, authenticateToken } = require('./auth');
const { calculateNextReview } = require('./spacedRepetition');
const { buildSchedulingInsights } = require('./schedulingInsights');
const { createDeck, getDueCardsByDeck, getStats, submitStudySession } = require('./apiHandlers');

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
  return createDeck(req, res, pool);
});

app.get('/api/cards/:deckId', (req, res) => getDueCardsByDeck(req, res, pool));
app.post('/api/study-session', (req, res) => submitStudySession(req, res, pool, calculateNextReview));

app.get('/api/stats', (req, res) => getStats(req, res, pool));

app.get('/api/scheduling-insights', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.next_review, c.ease_factor, c.review_count
       FROM cards c
       JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = $1`,
      [req.user.userId]
    );

    const insights = buildSchedulingInsights(rows);
    res.json(insights);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = {
  app,
};
