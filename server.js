const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createAuthHandlers } = require('./auth');
const { handleApiNotFound } = require('./apiNotFound');
const { buildCorsOptions, handleCorsError } = require('./corsPolicy');
const { createJsonBodyParser, handleJsonBodyError } = require('./jsonBodyError');
const { calculateNextReview } = require('./spacedRepetition');
const { createCard, createDeck, deleteCard, deleteDeck, getCardsByDeck, getDecks, getDueCardsByDeck, getStats, getSchedulingInsights, renameDeck, submitStudySession, updateCard } = require('./apiHandlers');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors(buildCorsOptions()));
app.use(handleCorsError);
app.use(createJsonBodyParser(express));
app.use(handleJsonBodyError);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const { register, login, authenticateToken } = createAuthHandlers(pool);

// Auth routes
app.post('/api/register', register);
app.post('/api/login', login);

// Protected routes
app.use(authenticateToken);

app.get('/api/decks', (req, res) => getDecks(req, res, pool));

app.post('/api/decks', async (req, res) => {
  return createDeck(req, res, pool);
});

app.patch('/api/decks/:deckId', (req, res) => renameDeck(req, res, pool));
app.delete('/api/decks/:deckId', (req, res) => deleteDeck(req, res, pool));
app.get('/api/decks/:deckId/cards', (req, res) => getCardsByDeck(req, res, pool));

app.post('/api/cards', (req, res) => createCard(req, res, pool));
app.get('/api/cards/:deckId', (req, res) => getDueCardsByDeck(req, res, pool));
app.patch('/api/cards/:cardId', (req, res) => updateCard(req, res, pool));
app.delete('/api/cards/:cardId', (req, res) => deleteCard(req, res, pool));
app.post('/api/study-session', (req, res) => submitStudySession(req, res, pool, calculateNextReview));

app.get('/api/stats', (req, res) => getStats(req, res, pool));

app.get('/api/scheduling-insights', (req, res) => getSchedulingInsights(req, res, pool));

app.use('/api', handleApiNotFound);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = {
  app,
};
