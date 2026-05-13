const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition } = require('./schemaHelpers');
const { submitStudySession } = require('../apiHandlers');
const { calculateNextReview } = require('../spacedRepetition');

const cardsTable = getTableDefinition('cards');
const schedulingMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '002_enforce_card_scheduling_constraints.sql'),
  'utf8',
);

function getCheckFloor(constraintName, columnName) {
  const match = cardsTable.match(
    new RegExp(
      `\\bCONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*${columnName}\\s*>=\\s*([0-9.]+)\\s*\\)`,
      'i',
    ),
  );

  assert.ok(match, `Expected ${constraintName} to constrain ${columnName}`);
  return Number(match[1]);
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createStudySessionDb(sourceCard) {
  const calls = [];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      if (calls.length === 1) {
        return { rowCount: 1, rows: [sourceCard] };
      }

      if (calls.length === 2) {
        return {
          rowCount: 1,
          rows: [{
            id: sourceCard.id,
            next_review: params[1],
            interval: params[2],
            ease_factor: params[3],
            review_count: 1,
            last_reviewed: params[0],
            __updated: true,
          }],
        };
      }

      throw new Error('Unexpected query');
    },
  };
}

function assertOrdered(haystack, firstNeedle, secondNeedle) {
  const firstIndex = haystack.search(firstNeedle);
  const secondIndex = haystack.search(secondNeedle);

  assert.notEqual(firstIndex, -1, `Expected SQL to contain ${firstNeedle}`);
  assert.notEqual(secondIndex, -1, `Expected SQL to contain ${secondNeedle}`);
  assert.ok(firstIndex < secondIndex, `Expected ${firstNeedle} before ${secondNeedle}`);
}

test('anki.db constrains persisted card scheduling state to app invariants', () => {
  // anki.db is the canonical bootstrap schema for new databases. Existing
  // deployments must run the data-normalizing migration before relying on
  // these checks.
  assert.match(cardsTable, /\binterval\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1\b/i);
  assert.match(cardsTable, /\breview_count\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0\b/i);
  assert.match(cardsTable, /\bease_factor\s+FLOAT\s+NOT\s+NULL\s+DEFAULT\s+2\.5\b/i);

  assert.match(
    cardsTable,
    /\bCONSTRAINT\s+cards_interval_min_check\s+CHECK\s*\(\s*interval\s*>=\s*1\s*\)/i,
  );
  assert.match(
    cardsTable,
    /\bCONSTRAINT\s+cards_review_count_non_negative_check\s+CHECK\s*\(\s*review_count\s*>=\s*0\s*\)/i,
  );
  assert.match(
    cardsTable,
    /\bCONSTRAINT\s+cards_ease_factor_min_check\s+CHECK\s*\(\s*ease_factor\s*>=\s*1\.3\s*\)/i,
  );
});

test('card scheduling migration normalizes legacy rows before enforcing constraints', () => {
  assert.match(schedulingMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(schedulingMigration, /COMMIT;\s*$/i);
  assert.match(
    schedulingMigration,
    /LOCK\s+TABLE\s+cards\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(schedulingMigration, /UPDATE\s+cards\s+SET/i);
  assert.match(
    schedulingMigration,
    /interval\s+=\s+CASE\s+WHEN\s+interval\s+IS\s+NULL\s+OR\s+interval\s+<\s+1\s+THEN\s+1/i,
  );
  assert.match(
    schedulingMigration,
    /review_count\s+=\s+CASE\s+WHEN\s+review_count\s+IS\s+NULL\s+OR\s+review_count\s+<\s+0\s+THEN\s+0/i,
  );
  assert.match(
    schedulingMigration,
    /ease_factor\s+=\s+CASE\s+WHEN\s+ease_factor\s+IS\s+NULL\s+OR\s+ease_factor\s+<\s+1\.3\s+THEN\s+1\.3/i,
  );

  assertOrdered(schedulingMigration, /\bLOCK\s+TABLE\b/i, /\bUPDATE\s+cards\b/i);
  assertOrdered(schedulingMigration, /\bUPDATE\s+cards\b/i, /\bALTER\s+TABLE\s+cards\b/i);
  assert.doesNotMatch(schedulingMigration, /\bDELETE\s+FROM\s+cards\b/i);
});

test('card scheduling migration and bootstrap schema enforce matching constraints', () => {
  for (const [columnName, defaultValue] of [
    ['interval', '1'],
    ['review_count', '0'],
    ['ease_factor', '2.5'],
  ]) {
    assert.match(
      schedulingMigration,
      new RegExp(`ALTER\\s+COLUMN\\s+${columnName}\\s+SET\\s+DEFAULT\\s+${defaultValue}`, 'i'),
    );
    assert.match(
      schedulingMigration,
      new RegExp(`ALTER\\s+COLUMN\\s+${columnName}\\s+SET\\s+NOT\\s+NULL`, 'i'),
    );
  }

  for (const [constraintName, expression] of [
    ['cards_interval_min_check', 'interval\\s*>=\\s*1'],
    ['cards_review_count_non_negative_check', 'review_count\\s*>=\\s*0'],
    ['cards_ease_factor_min_check', 'ease_factor\\s*>=\\s*1\\.3'],
  ]) {
    assert.match(cardsTable, new RegExp(`CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*${expression}\\s*\\)`, 'i'));
    assert.match(schedulingMigration, new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${constraintName}`, 'i'));
    assert.match(schedulingMigration, new RegExp(`ADD\\s+CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*${expression}\\s*\\)`, 'i'));
  }
});

test('card scheduling constraints match calculateNextReview runtime floors', () => {
  const intervalFloor = getCheckFloor('cards_interval_min_check', 'interval');
  const easeFactorFloor = getCheckFloor('cards_ease_factor_min_check', 'ease_factor');
  const reviewedAt = new Date('2026-05-10T14:30:00.000Z');

  const failedLowEaseReview = calculateNextReview({
    interval: 7,
    ease_factor: 1.31,
    review_count: 3,
  }, 0, reviewedAt);
  assert.equal(failedLowEaseReview.interval, intervalFloor);
  assert.equal(failedLowEaseReview.ease_factor, easeFactorFloor);

  for (const persistedCard of [
    { interval: -10, ease_factor: Number.NaN },
    { interval: 0, ease_factor: 1.1 },
    { interval: Number.POSITIVE_INFINITY, ease_factor: Number.NEGATIVE_INFINITY },
  ]) {
    const result = calculateNextReview(persistedCard, 3, reviewedAt);

    assert.equal(Number.isInteger(result.interval), true);
    assert.equal(result.interval >= intervalFloor, true);
    assert.equal(Number.isFinite(result.ease_factor), true);
    assert.equal(result.ease_factor >= easeFactorFloor, true);
  }
});

test('study session update writes scheduler output within card scheduling constraints', async () => {
  const intervalFloor = getCheckFloor('cards_interval_min_check', 'interval');
  const easeFactorFloor = getCheckFloor('cards_ease_factor_min_check', 'ease_factor');
  const db = createStudySessionDb({
    id: 17,
    deck_id: 3,
    front_content: 'Front',
    back_content: 'Back',
    created_at: '2026-05-01T12:00:00.000Z',
    last_reviewed: null,
    next_review: null,
    interval: 0,
    ease_factor: 1.1,
    review_count: null,
    __is_due: true,
  });
  const req = { body: { cardId: 17, quality: 3 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, calculateNextReview);

  assert.equal(res.statusCode, 200);
  assert.equal(db.calls.length, 2);
  const updateCall = db.calls[1];
  assert.match(
    updateCall.sql,
    /review_count\s+=\s+COALESCE\s*\(\s*review_count\s*,\s*0\s*\)\s*\+\s*1/i,
  );
  assert.equal(updateCall.params[2] >= intervalFloor, true);
  assert.equal(updateCall.params[3] >= easeFactorFloor, true);
});
