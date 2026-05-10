const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const deckSource = fs.readFileSync(path.join(__dirname, '..', 'deck.js'), 'utf8');

function extractConstFunctionBody(name) {
  const marker = `const ${name} =`;
  const start = deckSource.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${name} to be defined`);

  const arrowStart = deckSource.indexOf('=>', start);
  assert.notEqual(arrowStart, -1, `Expected ${name} to be an arrow function`);

  const bodyStart = deckSource.indexOf('{', arrowStart);
  assert.notEqual(bodyStart, -1, `Expected ${name} to have a block body`);

  let depth = 0;
  for (let index = bodyStart; index < deckSource.length; index += 1) {
    const char = deckSource[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return deckSource.slice(bodyStart + 1, index);
      }
    }
  }

  assert.fail(`Expected ${name} block body to close`);
}

test('initial deck list load uses the prominent fetchDecks default', () => {
  assert.match(
    deckSource,
    /const fetchDecks = useCallback\(async \(options = \{\}\) => \{/
  );
  assert.match(deckSource, /const \{\s*silent = false\s*\} = options;/);

  const initialLoadEffect = deckSource.match(
    /useEffect\(\(\) => \{\s*fetchDecks\(\);\s*return \(\) => \{\s*deckListRequestIdRef\.current \+= 1;\s*\};\s*\}, \[fetchDecks\]\);/
  );

  assert.ok(initialLoadEffect, 'Expected initial load effect to call fetchDecks with defaults');
  assert.doesNotMatch(initialLoadEffect[0], /silent:\s*true/);
});

test('successful mutation refreshes request a silent deck list update', () => {
  for (const functionName of ['createDeck', 'renameDeck', 'deleteCard', 'deleteDeck']) {
    const body = extractConstFunctionBody(functionName);
    assert.match(
      body,
      /void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
      `Expected ${functionName} to refresh decks silently`
    );
    assert.doesNotMatch(
      body,
      /(?:^|[^\w])fetchDecks\(\);/,
      `Expected ${functionName} not to use the prominent deck refresh`
    );
  }
});

test('deleteCard requires a card object with an id before removal work', () => {
  const body = extractConstFunctionBody('deleteCard');
  assert.match(body, /const isCardObject = card && typeof card === 'object';/);
  assert.match(body, /const cardId = isCardObject \? card\.id : undefined;/);
  assert.match(body, /if \(!isCardObject \|\| !hasUsableCardId\) \{\s*return;\s*\}/);
  assert.doesNotMatch(body, /card\?\.id\s*\?\?\s*card/);

  const guardIndex = body.indexOf('if (!isCardObject || !hasUsableCardId) {');
  const networkIndex = body.indexOf('fetch(apiRequests.removeCardUrl(cardId)');
  assert.notEqual(networkIndex, -1, 'Expected deleteCard to keep the remove-card request');
  assert.ok(
    guardIndex < networkIndex,
    'Expected invalid card inputs to return before network removal work'
  );
});

test('silent fetch terminal failures clear loading without showing prominent load errors', () => {
  const body = extractConstFunctionBody('fetchDecks');
  assert.match(
    body,
    /const finishSilentDeckListFailure = \(\) => \{\s*setDeckListLoadState\(\(currentState\) => finishDeckListSilentFailure\(currentState\)\);\s*\};/,
    'Expected silent fetch failures to use the silent load-state terminal helper'
  );

  assert.equal(
    (body.match(/if \(silent\) \{\s*finishSilentDeckListFailure\(\);\s*\}/g) || []).length,
    3,
    'Expected non-2xx, invalid payload, and network silent failures to clear loading'
  );
});

test('successful mutations update visible deck state before background refresh', () => {
  const expectations = {
    createDeck: /setDecks\(\(currentDecks\) => addCreatedDeck\(currentDecks, data, submission\.name\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
    renameDeck: /setDecks\(\(currentDecks\) => mergeRenamedDeck\(currentDecks, deckId, data, submission\.name\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
    deleteCard: /setDecks\(\(currentDecks\) => decrementDeckCardCounts\(currentDecks, deckId, card\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
    deleteDeck: /setDecks\(\(currentDecks\) => removeDeckFromList\(currentDecks, deckId\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
  };

  for (const [functionName, expectation] of Object.entries(expectations)) {
    assert.match(
      extractConstFunctionBody(functionName),
      expectation,
      `Expected ${functionName} to update local deck state before silent refresh`
    );
  }
});
