const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');

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

test('clearDeckCardSearch reloads first page without a search filter through existing guards', () => {
  const body = extractConstFunctionBody('clearDeckCardSearch');

  assert.match(body, /const currentDeckCards = deckCards\[deckId\] \|\| \{\};/);
  assert.match(
    body,
    /if \(currentDeckCards\.loading \|\| currentDeckCards\.loadingMore\) \{\s*return;\s*\}/,
    'Expected clear-search to respect card browser in-flight guards'
  );
  assert.match(
    body,
    /fetchDeckCards\(deckId, \{\s*q: clearSearchRequest\?\.q \|\| '',\s*\}\);/,
    'Expected clear-search to use the replace fetch path with an empty query'
  );
  assert.doesNotMatch(body, /append:\s*true/);
});

test('clear-search button accessible name starts with the visible label', () => {
  const clearSearchButton = deckSource.match(
    /cardBrowserDisplay\.showEmptySearchResult && \([\s\S]*?\{cardBrowserDisplay\.clearSearchButtonLabel\}[\s\S]*?\)/
  );

  assert.ok(clearSearchButton, 'Expected the empty-search clear button to be rendered');
  assert.match(
    clearSearchButton[0],
    /aria-label=\{`Clear search for \$\{deck\.name\}`\}/
  );
  assert.doesNotMatch(clearSearchButton[0], /Clear card search/);
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

test('fetchDeckCards validates successful browse payloads before storing them', () => {
  const body = extractConstFunctionBody('fetchDeckCards');
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));');
  const responseOkIndex = body.indexOf('if (!response.ok) {');
  const validationIndex = body.indexOf('browseResponse = parseDeckCardBrowseResponsePayload(data);');
  const staleGuardIndex = body.lastIndexOf('if (!isCurrentDeckCardBrowserResponse()) {', validationIndex);
  const setCardsIndex = body.indexOf(
    'cards: append ? mergeUniqueCards(currentRows, browseResponse.cards) : browseResponse.cards,',
  );
  const setCursorIndex = body.indexOf('nextCursor: browseResponse.nextCursor,');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckCardBrowseResponse['"]\)/,
    'Expected deck.js to import the card-browser response validator',
  );
  assert.match(
    deckSource,
    /const \{ parseDeckCardBrowseResponsePayload \} = deckCardBrowseResponse;/,
    'Expected deck.js to destructure the card-browser response parser',
  );
  assert.notEqual(authExpiredIndex, -1, 'Expected auth-expired handling to remain in fetchDeckCards');
  assert.notEqual(jsonIndex, -1, 'Expected fetchDeckCards to parse response JSON');
  assert.notEqual(responseOkIndex, -1, 'Expected fetchDeckCards to keep non-2xx handling');
  assert.notEqual(staleGuardIndex, -1, 'Expected fetchDeckCards to keep stale response protection');
  assert.notEqual(validationIndex, -1, 'Expected fetchDeckCards to validate successful payloads');
  assert.notEqual(setCardsIndex, -1, 'Expected fetchDeckCards to store parsed cards');
  assert.notEqual(setCursorIndex, -1, 'Expected fetchDeckCards to store the parsed cursor');
  assert.ok(authExpiredIndex < jsonIndex, 'Expected auth expiration handling before JSON parsing');
  assert.ok(jsonIndex < responseOkIndex, 'Expected non-2xx handling after JSON parsing');
  assert.ok(responseOkIndex < staleGuardIndex, 'Expected success stale guard after non-2xx handling');
  assert.ok(staleGuardIndex < validationIndex, 'Expected validation after the stale response guard');
  assert.ok(validationIndex < setCardsIndex, 'Expected validation before storing cards');
  assert.ok(validationIndex < setCursorIndex, 'Expected validation before storing the cursor');
  assert.match(
    body.slice(validationIndex, setCardsIndex),
    /setDeckCardBrowserFailure\(append \? 'Unable to load more cards\.' : 'Unable to load cards\.'\);/,
    'Expected malformed successful payloads to use the retryable browser failure path',
  );
  assert.doesNotMatch(body, /Array\.isArray\(data\.cards\) \? data\.cards : \[\]/);
  assert.doesNotMatch(body, /nextCursor: data\.nextCursor \|\| null/);
});

test('card mutations validate successful payloads before updating visible state', () => {
  const addBody = extractConstFunctionBody('addCard');
  const saveBody = extractConstFunctionBody('saveCard');
  const addAuthExpiredIndex = addBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const addJsonIndex = addBody.indexOf('const data = await response.json().catch(() => ({}));');
  const addResponseOkIndex = addBody.indexOf('if (!response.ok) {');
  const addValidationIndex = addBody.indexOf('createdCard = parseDeckCardMutationResponsePayload(data);');
  const addClearFormIndex = addBody.indexOf('setCardForms((currentForms) => ({');
  const addIncrementIndex = addBody.indexOf('incrementDeckCardCounts(currentDecks, deckId, createdCard)');
  const addLocalCardIndex = addBody.indexOf('addCreatedCardToLoadedDeckCards(currentCards, deckId, createdCard)');
  const saveAuthExpiredIndex = saveBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const saveJsonIndex = saveBody.indexOf('const data = await response.json().catch(() => ({}));');
  const saveResponseOkIndex = saveBody.indexOf('if (!response.ok) {');
  const saveValidationIndex = saveBody.indexOf('savedCard = parseDeckCardMutationResponsePayload(data);');
  const saveMergeIndex = saveBody.indexOf('updateLoadedCard(deckId, card.id, savedCard);');
  const saveEditFormIndex = saveBody.indexOf('frontContent: savedCard.front_content ?? frontContent,');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckCardMutationResponse['"]\)/,
    'Expected deck.js to import the card-mutation response validator',
  );
  assert.match(
    deckSource,
    /const \{ parseDeckCardMutationResponsePayload \} = deckCardMutationResponse;/,
    'Expected deck.js to destructure the card-mutation response parser',
  );

  assert.notEqual(addAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in addCard');
  assert.notEqual(addJsonIndex, -1, 'Expected addCard to parse response JSON');
  assert.notEqual(addResponseOkIndex, -1, 'Expected addCard to keep non-2xx handling');
  assert.notEqual(addValidationIndex, -1, 'Expected addCard to validate successful payloads');
  assert.notEqual(addClearFormIndex, -1, 'Expected addCard to clear the form only after validation');
  assert.notEqual(addIncrementIndex, -1, 'Expected addCard to increment counts using the parsed card');
  assert.notEqual(addLocalCardIndex, -1, 'Expected addCard to add the parsed card locally');
  assert.ok(addAuthExpiredIndex < addJsonIndex, 'Expected addCard auth expiration before JSON parsing');
  assert.ok(addJsonIndex < addResponseOkIndex, 'Expected addCard non-2xx handling after JSON parsing');
  assert.ok(addResponseOkIndex < addValidationIndex, 'Expected addCard validation after non-2xx handling');
  assert.ok(addValidationIndex < addClearFormIndex, 'Expected addCard validation before clearing the form');
  assert.ok(addValidationIndex < addIncrementIndex, 'Expected addCard validation before count updates');
  assert.ok(addValidationIndex < addLocalCardIndex, 'Expected addCard validation before local card insertion');
  assert.match(
    addBody.slice(addResponseOkIndex, addValidationIndex),
    /error: data\.error \|\| 'Unable to add card\.'/,
    'Expected addCard non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    addBody.slice(addValidationIndex, addClearFormIndex),
    /error: 'Unable to add card\.'/,
    'Expected malformed successful creates to use safe add-card failure copy',
  );

  assert.notEqual(saveAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in saveCard');
  assert.notEqual(saveJsonIndex, -1, 'Expected saveCard to parse response JSON');
  assert.notEqual(saveResponseOkIndex, -1, 'Expected saveCard to keep non-2xx handling');
  assert.notEqual(saveValidationIndex, -1, 'Expected saveCard to validate successful payloads');
  assert.notEqual(saveMergeIndex, -1, 'Expected saveCard to merge only the parsed card');
  assert.notEqual(saveEditFormIndex, -1, 'Expected saveCard to overwrite forms only from the parsed card');
  assert.ok(saveAuthExpiredIndex < saveJsonIndex, 'Expected saveCard auth expiration before JSON parsing');
  assert.ok(saveJsonIndex < saveResponseOkIndex, 'Expected saveCard non-2xx handling after JSON parsing');
  assert.ok(saveResponseOkIndex < saveValidationIndex, 'Expected saveCard validation after non-2xx handling');
  assert.ok(saveValidationIndex < saveMergeIndex, 'Expected saveCard validation before merging card data');
  assert.ok(saveValidationIndex < saveEditFormIndex, 'Expected saveCard validation before edit form writes');
  assert.match(
    saveBody.slice(saveResponseOkIndex, saveValidationIndex),
    /error: data\.error \|\| 'Unable to save card\.'/,
    'Expected saveCard non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    saveBody.slice(saveValidationIndex, saveMergeIndex),
    /error: 'Unable to save card\.'/,
    'Expected malformed successful saves to use safe save-card failure copy',
  );
});

test('CRA source sync mirrors the card-browser response validator', () => {
  assert.ok(
    FRONTEND_MODULES.includes('deckCardBrowseResponse.js'),
    'Expected deckCardBrowseResponse.js to be mirrored into CRA src',
  );
  assert.ok(
    FRONTEND_MODULES.includes('deckCardMutationResponse.js'),
    'Expected deckCardMutationResponse.js to be mirrored into CRA src',
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
