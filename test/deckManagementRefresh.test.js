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

test('fetchDecks ignores stale deck-list responses before auth-expiration side effects', () => {
  const body = extractConstFunctionBody('fetchDecks');
  const fetchIndex = body.indexOf('const response = await fetch(apiRequests.deckListUrl, {');
  const currentGuardIndex = body.indexOf('if (!isCurrentDeckListResponse()) {', fetchIndex);
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const nonOkIndex = body.indexOf('if (!response.ok) {');

  assert.match(
    deckSource,
    /getDeckListLoadFailureMessage,\s*isCurrentDeckListRequest,/,
    'Expected deck.js to import the deck-list request lifecycle helper',
  );
  assert.match(
    body,
    /const isCurrentDeckListResponse = \(\) => isCurrentDeckListRequest\(\{\s*isMountedRef: isDeckListMountedRef,\s*requestIdRef: deckListRequestIdRef,\s*requestId,\s*\}\);/,
    'Expected deck-list responses to be checked through the pure lifecycle helper',
  );
  assert.notEqual(fetchIndex, -1, 'Expected fetchDecks to keep the deck-list fetch');
  assert.notEqual(currentGuardIndex, -1, 'Expected fetchDecks to guard after fetch resolution');
  assert.notEqual(authExpiredIndex, -1, 'Expected fetchDecks to keep auth-expiration handling');
  assert.notEqual(nonOkIndex, -1, 'Expected fetchDecks to keep non-OK handling');
  assert.ok(fetchIndex < currentGuardIndex, 'Expected current guard after fetch resolution');
  assert.ok(
    currentGuardIndex < authExpiredIndex,
    'Expected stale responses to return before auth-expiration handling',
  );
  assert.ok(currentGuardIndex < nonOkIndex, 'Expected stale responses to return before generic failures');
  assert.match(
    body.slice(currentGuardIndex, authExpiredIndex),
    /return false;/,
    'Expected stale deck-list responses to avoid response side effects',
  );
});

test('fetchDeckCards ignores stale card-browser responses before auth-expiration side effects', () => {
  const body = extractConstFunctionBody('fetchDeckCards');
  const currentResponseFunctionIndex = body.indexOf('const isCurrentDeckCardBrowserResponse = () => (');
  const appendCurrentIndex = body.indexOf('canApplyDeckCardBrowserAppendResponse(', currentResponseFunctionIndex);
  const replaceCurrentIndex = body.indexOf('isLatestDeckCardBrowserReplaceRequest(', currentResponseFunctionIndex);
  const fetchIndex = body.indexOf('const response = await fetch(apiRequests.browseDeckCardsUrl(deckId, searchParams), {');
  const currentGuardIndex = body.indexOf('if (!isCurrentDeckCardBrowserResponse()) {', fetchIndex);
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))', fetchIndex);
  const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));', fetchIndex);
  const nonOkIndex = body.indexOf('if (!response.ok) {', fetchIndex);

  assert.notEqual(
    currentResponseFunctionIndex,
    -1,
    'Expected fetchDeckCards to keep a current-response guard',
  );
  assert.notEqual(
    appendCurrentIndex,
    -1,
    'Expected append/load-more responses to use the current append request guard',
  );
  assert.notEqual(
    replaceCurrentIndex,
    -1,
    'Expected replace/search responses to use the latest replace request guard',
  );
  assert.notEqual(fetchIndex, -1, 'Expected fetchDeckCards to keep the browse-card fetch');
  assert.notEqual(currentGuardIndex, -1, 'Expected fetchDeckCards to guard after fetch resolution');
  assert.notEqual(authExpiredIndex, -1, 'Expected fetchDeckCards to keep auth-expiration handling');
  assert.notEqual(jsonIndex, -1, 'Expected fetchDeckCards to parse response JSON');
  assert.notEqual(nonOkIndex, -1, 'Expected fetchDeckCards to keep non-2xx handling');
  assert.ok(
    appendCurrentIndex < replaceCurrentIndex,
    'Expected append responses to be guarded by the append branch',
  );
  assert.ok(fetchIndex < currentGuardIndex, 'Expected current guard after fetch resolution');
  assert.ok(
    currentGuardIndex < authExpiredIndex,
    'Expected stale responses to return before auth-expiration handling',
  );
  assert.ok(currentGuardIndex < jsonIndex, 'Expected stale responses to return before JSON parsing');
  assert.ok(currentGuardIndex < nonOkIndex, 'Expected stale responses to return before generic failures');
  assert.match(
    body.slice(currentGuardIndex, authExpiredIndex),
    /return;/,
    'Expected stale deck-card browser responses to avoid response side effects',
  );
  assert.match(
    body.slice(authExpiredIndex, jsonIndex),
    /return;/,
    'Expected current auth-expired responses to keep the logout side effect path',
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

test('deck mutations validate successful payloads before updating visible state', () => {
  const createBody = extractConstFunctionBody('createDeck');
  const renameBody = extractConstFunctionBody('renameDeck');
  const createAuthExpiredIndex = createBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const createJsonIndex = createBody.indexOf('const data = await response.json().catch(() => ({}));');
  const createResponseOkIndex = createBody.indexOf('if (!response.ok) {');
  const createValidationIndex = createBody.indexOf('createdDeck = parseDeckMutationResponsePayload(data);');
  const createClearInputIndex = createBody.indexOf("setNewDeckName('');");
  const createLocalStateIndex = createBody.indexOf(
    'addCreatedDeck(currentDecks, createdDeck, submission.name)',
  );
  const createSilentRefreshIndex = createBody.indexOf('void fetchDecks({ silent: true });');
  const createSuccessIndex = createBody.indexOf('showCreateDeckSuccess();');
  const renameAuthExpiredIndex = renameBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const renameJsonIndex = renameBody.indexOf('const data = await response.json().catch(() => ({}));');
  const renameResponseOkIndex = renameBody.indexOf('if (!response.ok) {');
  const renameValidationIndex = renameBody.indexOf(
    'renamedDeck = parseDeckMutationResponsePayload(data, { expectedId: deckId });',
  );
  const renameClearFormIndex = renameBody.indexOf('clearRenameDeckState(deckId);', renameValidationIndex);
  const renameLocalStateIndex = renameBody.indexOf(
    'mergeRenamedDeck(currentDecks, deckId, renamedDeck, submission.name)',
  );
  const renameSilentRefreshIndex = renameBody.indexOf('void fetchDecks({ silent: true });');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckMutationResponse['"]\)/,
    'Expected deck.js to import the deck-mutation response validator',
  );
  assert.match(
    deckSource,
    /const \{ parseDeckMutationResponsePayload \} = deckMutationResponse;/,
    'Expected deck.js to destructure the deck-mutation response parser',
  );

  assert.notEqual(createAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in createDeck');
  assert.notEqual(createJsonIndex, -1, 'Expected createDeck to parse response JSON');
  assert.notEqual(createResponseOkIndex, -1, 'Expected createDeck to keep non-2xx handling');
  assert.notEqual(createValidationIndex, -1, 'Expected createDeck to validate successful payloads');
  assert.notEqual(createClearInputIndex, -1, 'Expected createDeck to clear the input only after validation');
  assert.notEqual(createLocalStateIndex, -1, 'Expected createDeck to add only the parsed deck locally');
  assert.notEqual(createSilentRefreshIndex, -1, 'Expected createDeck to silently refresh only after validation');
  assert.notEqual(createSuccessIndex, -1, 'Expected createDeck to show success only after validation');
  assert.ok(createAuthExpiredIndex < createJsonIndex, 'Expected createDeck auth expiration before JSON parsing');
  assert.ok(createJsonIndex < createResponseOkIndex, 'Expected createDeck non-2xx handling after JSON parsing');
  assert.ok(createResponseOkIndex < createValidationIndex, 'Expected createDeck validation after non-2xx handling');
  assert.ok(createValidationIndex < createClearInputIndex, 'Expected createDeck validation before clearing input');
  assert.ok(createValidationIndex < createLocalStateIndex, 'Expected createDeck validation before local insertion');
  assert.ok(createValidationIndex < createSilentRefreshIndex, 'Expected createDeck validation before silent refresh');
  assert.ok(createValidationIndex < createSuccessIndex, 'Expected createDeck validation before success status');
  assert.match(
    createBody.slice(createResponseOkIndex, createValidationIndex),
    /error: getCreateDeckFailureMessage\(data\),/,
    'Expected createDeck non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    createBody.slice(createValidationIndex, createClearInputIndex),
    /error: CREATE_DECK_MESSAGES\.createFailed,/,
    'Expected malformed successful creates to use safe create-deck failure copy',
  );

  assert.notEqual(renameAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in renameDeck');
  assert.notEqual(renameJsonIndex, -1, 'Expected renameDeck to parse response JSON');
  assert.notEqual(renameResponseOkIndex, -1, 'Expected renameDeck to keep non-2xx handling');
  assert.notEqual(renameValidationIndex, -1, 'Expected renameDeck to validate successful payloads');
  assert.notEqual(renameClearFormIndex, -1, 'Expected renameDeck to keep the form open until validation passes');
  assert.notEqual(renameLocalStateIndex, -1, 'Expected renameDeck to merge only the parsed deck locally');
  assert.notEqual(renameSilentRefreshIndex, -1, 'Expected renameDeck to silently refresh only after validation');
  assert.ok(renameAuthExpiredIndex < renameJsonIndex, 'Expected renameDeck auth expiration before JSON parsing');
  assert.ok(renameJsonIndex < renameResponseOkIndex, 'Expected renameDeck non-2xx handling after JSON parsing');
  assert.ok(renameResponseOkIndex < renameValidationIndex, 'Expected renameDeck validation after non-2xx handling');
  assert.ok(renameValidationIndex < renameClearFormIndex, 'Expected renameDeck validation before clearing form state');
  assert.ok(renameValidationIndex < renameLocalStateIndex, 'Expected renameDeck validation before local merge');
  assert.ok(renameValidationIndex < renameSilentRefreshIndex, 'Expected renameDeck validation before silent refresh');
  assert.match(
    renameBody.slice(renameResponseOkIndex, renameValidationIndex),
    /\[deckId\]: getRenameDeckFailureMessage\(data\),/,
    'Expected renameDeck non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    renameBody.slice(renameValidationIndex, renameClearFormIndex),
    /\[deckId\]: RENAME_DECK_MESSAGES\.renameFailed,/,
    'Expected malformed successful renames to use safe rename-deck failure copy',
  );
});

test('deleteDeck validates successful removal payloads before updating visible state', () => {
  const body = extractConstFunctionBody('deleteDeck');
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));');
  const responseOkIndex = body.indexOf('if (!response.ok) {');
  const validationIndex = body.indexOf('parseDeckRemovalSuccessPayload(data);');
  const clearErrorIndex = body.indexOf('delete nextErrors[deckId];', validationIndex);
  const removeDeckIndex = body.indexOf('removeDeckFromList(currentDecks, deckId)');
  const removeCardsIndex = body.indexOf('delete nextCards[deckId];');
  const silentRefreshIndex = body.indexOf('void fetchDecks({ silent: true });');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckRemovalResponse['"]\)/,
    'Expected deck.js to import the deck-removal response validator',
  );
  assert.match(
    deckSource,
    /const \{ parseDeckRemovalSuccessPayload \} = deckRemovalResponse;/,
    'Expected deck.js to destructure the deck-removal response parser',
  );

  assert.notEqual(authExpiredIndex, -1, 'Expected auth-expired handling to remain in deleteDeck');
  assert.notEqual(jsonIndex, -1, 'Expected deleteDeck to parse response JSON');
  assert.notEqual(responseOkIndex, -1, 'Expected deleteDeck to keep non-2xx handling');
  assert.notEqual(validationIndex, -1, 'Expected deleteDeck to validate successful payloads');
  assert.notEqual(clearErrorIndex, -1, 'Expected deleteDeck to clear errors only after validation');
  assert.notEqual(removeDeckIndex, -1, 'Expected deleteDeck to remove the deck only after validation');
  assert.notEqual(removeCardsIndex, -1, 'Expected deleteDeck to remove deck cards only after validation');
  assert.notEqual(silentRefreshIndex, -1, 'Expected deleteDeck to silently refresh only after validation');
  assert.ok(authExpiredIndex < jsonIndex, 'Expected deleteDeck auth expiration before JSON parsing');
  assert.ok(jsonIndex < responseOkIndex, 'Expected deleteDeck non-2xx handling after JSON parsing');
  assert.ok(responseOkIndex < validationIndex, 'Expected deleteDeck validation after non-2xx handling');
  assert.ok(validationIndex < clearErrorIndex, 'Expected deleteDeck validation before clearing errors');
  assert.ok(validationIndex < removeDeckIndex, 'Expected deleteDeck validation before local deck removal');
  assert.ok(validationIndex < removeCardsIndex, 'Expected deleteDeck validation before local card cleanup');
  assert.ok(validationIndex < silentRefreshIndex, 'Expected deleteDeck validation before silent refresh');
  assert.match(
    body.slice(responseOkIndex, validationIndex),
    /\[deckId\]: data\.error \|\| 'Unable to delete deck\.',/,
    'Expected deleteDeck non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    body.slice(validationIndex, clearErrorIndex),
    /\[deckId\]: 'Unable to delete deck\.',/,
    'Expected malformed successful deletes to use safe delete-deck failure copy',
  );
});

test('deleteCard validates successful removal payloads before updating visible state', () => {
  const body = extractConstFunctionBody('deleteCard');
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));');
  const responseOkIndex = body.indexOf('if (!response.ok) {');
  const validationIndex = body.indexOf('parseDeckCardRemovalSuccessPayload(data);');
  const removeCardIndex = body.indexOf('removeLoadedCard(deckId, cardId);');
  const decrementCountsIndex = body.indexOf('decrementDeckCardCounts(currentDecks, deckId, card)');
  const clearEditFormIndex = body.indexOf('delete nextForms[cardId];');
  const clearActionIndex = body.indexOf('clearCardActionState(cardId);');
  const silentRefreshIndex = body.indexOf('void fetchDecks({ silent: true });');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckCardRemovalResponse['"]\)/,
    'Expected deck.js to import the card-removal response validator',
  );
  assert.match(
    deckSource,
    /const \{ parseDeckCardRemovalSuccessPayload \} = deckCardRemovalResponse;/,
    'Expected deck.js to destructure the card-removal response parser',
  );

  assert.notEqual(authExpiredIndex, -1, 'Expected auth-expired handling to remain in deleteCard');
  assert.notEqual(jsonIndex, -1, 'Expected deleteCard to parse response JSON');
  assert.notEqual(responseOkIndex, -1, 'Expected deleteCard to keep non-2xx handling');
  assert.notEqual(validationIndex, -1, 'Expected deleteCard to validate successful payloads');
  assert.notEqual(removeCardIndex, -1, 'Expected deleteCard to remove cards only after validation');
  assert.notEqual(decrementCountsIndex, -1, 'Expected deleteCard to decrement counts only after validation');
  assert.notEqual(clearEditFormIndex, -1, 'Expected deleteCard to clear edit forms only after validation');
  assert.notEqual(clearActionIndex, -1, 'Expected deleteCard to clear action state only after validation');
  assert.notEqual(silentRefreshIndex, -1, 'Expected deleteCard to silently refresh only after validation');
  assert.ok(authExpiredIndex < jsonIndex, 'Expected deleteCard auth expiration before JSON parsing');
  assert.ok(jsonIndex < responseOkIndex, 'Expected deleteCard non-2xx handling after JSON parsing');
  assert.ok(responseOkIndex < validationIndex, 'Expected deleteCard validation after non-2xx handling');
  assert.ok(validationIndex < removeCardIndex, 'Expected deleteCard validation before local card removal');
  assert.ok(validationIndex < decrementCountsIndex, 'Expected deleteCard validation before count decrement');
  assert.ok(validationIndex < clearEditFormIndex, 'Expected deleteCard validation before clearing edit forms');
  assert.ok(validationIndex < clearActionIndex, 'Expected deleteCard validation before clearing action state');
  assert.ok(validationIndex < silentRefreshIndex, 'Expected deleteCard validation before silent refresh');
  assert.match(
    body.slice(responseOkIndex, validationIndex),
    /error: data\.error \|\| 'Unable to remove card\.',/,
    'Expected deleteCard non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    body.slice(validationIndex, removeCardIndex),
    /error: 'Unable to remove card\.',/,
    'Expected malformed successful card deletes to use safe remove-card failure copy',
  );
});

test('CRA source sync mirrors deck-management response validators', () => {
  assert.ok(
    FRONTEND_MODULES.includes('deckCardBrowseResponse.js'),
    'Expected deckCardBrowseResponse.js to be mirrored into CRA src',
  );
  assert.ok(
    FRONTEND_MODULES.includes('deckCardMutationResponse.js'),
    'Expected deckCardMutationResponse.js to be mirrored into CRA src',
  );
  assert.ok(
    FRONTEND_MODULES.includes('deckCardRemovalResponse.js'),
    'Expected deckCardRemovalResponse.js to be mirrored into CRA src',
  );
  assert.ok(
    FRONTEND_MODULES.includes('deckMutationResponse.js'),
    'Expected deckMutationResponse.js to be mirrored into CRA src',
  );
  assert.ok(
    FRONTEND_MODULES.includes('deckRemovalResponse.js'),
    'Expected deckRemovalResponse.js to be mirrored into CRA src',
  );
});

test('successful mutations update visible deck state before background refresh', () => {
  const expectations = {
    createDeck: /setDecks\(\(currentDecks\) => addCreatedDeck\(currentDecks, createdDeck, submission\.name\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
    renameDeck: /setDecks\(\(currentDecks\) => mergeRenamedDeck\(currentDecks, deckId, renamedDeck, submission\.name\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
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
