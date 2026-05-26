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
  assert.match(
    deckSource,
    /const cardIdentifier = require\('\.\/cardIdentifier'\);/,
    'Expected deck.js to import the shared card identifier helper',
  );
  assert.match(
    deckSource,
    /const \{ hasRouteSafeCardId \} = cardIdentifier;/,
    'Expected deck.js to use the route-safe card id helper',
  );
  assert.match(body, /const isCardObject = card && typeof card === 'object';/);
  assert.match(body, /const cardId = isCardObject \? card\.id : undefined;/);
  assert.match(body, /const hasUsableCardId = hasRouteSafeCardId\(cardId\);/);
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

test('saveCard validates shared card content rules before starting a save request', () => {
  const body = extractConstFunctionBody('saveCard');
  const validationIndex = body.indexOf('const contentValidation = validateCardSubmissionContent({');
  const validationFailureIndex = body.indexOf('if (!contentValidation.ok) {', validationIndex);
  const validationErrorIndex = body.indexOf('error: contentValidation.error,', validationFailureIndex);
  const normalizedContentIndex = body.indexOf('const { frontContent, backContent } = contentValidation;', validationIndex);
  const inFlightIndex = body.indexOf('if (!beginCardSave(cardActionInFlightRef.current, card.id)) {');
  const requestBodyIndex = body.indexOf('frontContent,', inFlightIndex);
  const fetchIndex = body.indexOf('const response = await fetch(', inFlightIndex);

  assert.match(
    deckSource,
    /const \{[\s\S]*validateCardSubmissionContent,[\s\S]*\} = deckCardCreateState;/,
    'Expected DeckManagement to import shared card content submission validation',
  );
  assert.notEqual(validationIndex, -1, 'Expected saveCard to validate editable card text');
  assert.notEqual(validationFailureIndex, -1, 'Expected saveCard to handle validation failures locally');
  assert.notEqual(validationErrorIndex, -1, 'Expected saveCard to show the shared validation error');
  assert.notEqual(normalizedContentIndex, -1, 'Expected saveCard to use normalized validated content');
  assert.notEqual(inFlightIndex, -1, 'Expected saveCard to keep its in-flight guard');
  assert.notEqual(fetchIndex, -1, 'Expected saveCard to keep the save request');
  assert.notEqual(requestBodyIndex, -1, 'Expected saveCard to submit validated content');
  assert.ok(validationIndex < inFlightIndex, 'Expected unsafe content to return before save in-flight state starts');
  assert.ok(validationFailureIndex < inFlightIndex, 'Expected validation failures before save in-flight state starts');
  assert.ok(normalizedContentIndex < fetchIndex, 'Expected validated content before the save request body is built');
  assert.ok(fetchIndex < requestBodyIndex, 'Expected the save request body to include validated content');
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
  const nonOkFailureIndex = body.indexOf(
    'setDeckCardBrowserFailure(getDeckCardBrowseFailureMessage(data, { append }));',
    responseOkIndex,
  );
  const validationIndex = body.indexOf('browseResponse = parseDeckCardBrowseResponsePayload(data, {');
  const expectedDeckIdIndex = body.indexOf('expectedDeckId: deckId,', validationIndex);
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
    /const \{\s*getDeckCardBrowseFailureMessage,\s*parseDeckCardBrowseResponsePayload,\s*\} = deckCardBrowseResponse;/,
    'Expected deck.js to destructure the card-browser response helpers',
  );
  assert.notEqual(authExpiredIndex, -1, 'Expected auth-expired handling to remain in fetchDeckCards');
  assert.notEqual(jsonIndex, -1, 'Expected fetchDeckCards to parse response JSON');
  assert.notEqual(responseOkIndex, -1, 'Expected fetchDeckCards to keep non-2xx handling');
  assert.notEqual(
    nonOkFailureIndex,
    -1,
    'Expected non-2xx browse failures to use the descriptor-safe error helper',
  );
  assert.notEqual(staleGuardIndex, -1, 'Expected fetchDeckCards to keep stale response protection');
  assert.notEqual(validationIndex, -1, 'Expected fetchDeckCards to validate successful payloads');
  assert.notEqual(
    expectedDeckIdIndex,
    -1,
    'Expected fetchDeckCards to validate card rows against the requested deck id',
  );
  assert.notEqual(setCardsIndex, -1, 'Expected fetchDeckCards to store parsed cards');
  assert.notEqual(setCursorIndex, -1, 'Expected fetchDeckCards to store the parsed cursor');
  assert.ok(authExpiredIndex < jsonIndex, 'Expected auth expiration handling before JSON parsing');
  assert.ok(jsonIndex < responseOkIndex, 'Expected non-2xx handling after JSON parsing');
  assert.ok(responseOkIndex < nonOkFailureIndex, 'Expected non-2xx failures after response status check');
  assert.ok(nonOkFailureIndex < staleGuardIndex, 'Expected successful-payload handling after non-2xx failures');
  assert.ok(responseOkIndex < staleGuardIndex, 'Expected success stale guard after non-2xx handling');
  assert.ok(staleGuardIndex < validationIndex, 'Expected validation after the stale response guard');
  assert.ok(validationIndex < expectedDeckIdIndex, 'Expected expected-deck validation to be part of parsing');
  assert.ok(validationIndex < setCardsIndex, 'Expected validation before storing cards');
  assert.ok(validationIndex < setCursorIndex, 'Expected validation before storing the cursor');
  assert.match(
    body.slice(validationIndex, setCardsIndex),
    /setDeckCardBrowserFailure\(append \? 'Unable to load more cards\.' : 'Unable to load cards\.'\);/,
    'Expected malformed successful payloads to use the retryable browser failure path',
  );
  assert.doesNotMatch(body, /data\.error/);
  assert.doesNotMatch(body, /Array\.isArray\(data\.cards\) \? data\.cards : \[\]/);
  assert.doesNotMatch(body, /nextCursor: data\.nextCursor \|\| null/);
});

test('card mutations validate successful payloads before updating visible state', () => {
  const addBody = extractConstFunctionBody('addCard');
  const saveBody = extractConstFunctionBody('saveCard');
  const addAuthExpiredIndex = addBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const addJsonIndex = addBody.indexOf('const data = await response.json().catch(() => ({}));');
  const addResponseOkIndex = addBody.indexOf('if (!response.ok) {');
  const addNonOkCompletionIndex = addBody.indexOf(
    'const completion = getCardCreateResponseCompletion({',
    addResponseOkIndex,
  );
  const addValidationIndex = addBody.indexOf(
    'const completion = getCardCreateResponseCompletion({',
    addNonOkCompletionIndex + 1,
  );
  const addExpectedDeckIdIndex = addBody.indexOf('expectedDeckId: deckId,', addValidationIndex);
  const addInvalidResponseIndex = addBody.indexOf(
    'completion.type === CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE',
    addValidationIndex,
  );
  const addCreatedCardIndex = addBody.indexOf('const { createdCard } = completion;', addValidationIndex);
  const addClearFormIndex = addBody.indexOf('setCardForms((currentForms) => ({');
  const addIncrementIndex = addBody.indexOf('incrementDeckCardCounts(currentDecks, deckId, createdCard)');
  const addLocalCardIndex = addBody.indexOf('addCreatedCardToLoadedDeckCards(currentCards, deckId, createdCard)');
  const saveAuthExpiredIndex = saveBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const saveJsonIndex = saveBody.indexOf('const data = await response.json().catch(() => ({}));');
  const saveResponseOkIndex = saveBody.indexOf('if (!response.ok) {');
  const saveValidationIndex = saveBody.indexOf(
    'savedCard = parseDeckCardMutationResponsePayload(data, {',
  );
  const saveExpectedDeckIdIndex = saveBody.indexOf('expectedDeckId: deckId,', saveValidationIndex);
  const saveExpectedCardIdIndex = saveBody.indexOf('expectedId: card.id,', saveValidationIndex);
  const saveMergeIndex = saveBody.indexOf('updateLoadedCard(deckId, card.id, savedCard);');
  const saveEditFormIndex = saveBody.indexOf('frontContent: savedCard.front_content ?? frontContent,');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckCardMutationResponse['"]\)/,
    'Expected deck.js to import the card-mutation response validator',
  );
  assert.match(
    deckSource,
    /const \{[\s\S]*getDeckCardMutationFailureMessage,[\s\S]*parseDeckCardMutationResponsePayload,[\s\S]*\} = deckCardMutationResponse;/,
    'Expected deck.js to destructure the card-mutation response helpers',
  );

  assert.notEqual(addAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in addCard');
  assert.notEqual(addJsonIndex, -1, 'Expected addCard to parse response JSON');
  assert.notEqual(addResponseOkIndex, -1, 'Expected addCard to keep non-2xx handling');
  assert.notEqual(addNonOkCompletionIndex, -1, 'Expected addCard non-2xx handling to use the card-create helper');
  assert.notEqual(addValidationIndex, -1, 'Expected addCard to validate successful payloads');
  assert.notEqual(addExpectedDeckIdIndex, -1, 'Expected addCard to validate created card deck metadata');
  assert.notEqual(addInvalidResponseIndex, -1, 'Expected addCard to keep malformed-success handling');
  assert.notEqual(addCreatedCardIndex, -1, 'Expected addCard to use the helper-validated card');
  assert.notEqual(addClearFormIndex, -1, 'Expected addCard to clear the form only after validation');
  assert.notEqual(addIncrementIndex, -1, 'Expected addCard to increment counts using the parsed card');
  assert.notEqual(addLocalCardIndex, -1, 'Expected addCard to add the parsed card locally');
  assert.ok(addAuthExpiredIndex < addJsonIndex, 'Expected addCard auth expiration before JSON parsing');
  assert.ok(addJsonIndex < addResponseOkIndex, 'Expected addCard non-2xx handling after JSON parsing');
  assert.ok(addResponseOkIndex < addValidationIndex, 'Expected addCard validation after non-2xx handling');
  assert.ok(addValidationIndex < addExpectedDeckIdIndex, 'Expected addCard deck id validation to be parser-owned');
  assert.ok(addValidationIndex < addInvalidResponseIndex, 'Expected addCard validation before malformed-success handling');
  assert.ok(addValidationIndex < addCreatedCardIndex, 'Expected addCard to read created cards from the validation helper');
  assert.ok(addCreatedCardIndex < addClearFormIndex, 'Expected addCard to derive created cards before clearing the form');
  assert.ok(addValidationIndex < addClearFormIndex, 'Expected addCard validation before clearing the form');
  assert.ok(addValidationIndex < addIncrementIndex, 'Expected addCard validation before count updates');
  assert.ok(addValidationIndex < addLocalCardIndex, 'Expected addCard validation before local card insertion');
  assert.match(
    addBody.slice(addResponseOkIndex, addValidationIndex),
    /error: completion\.error,/,
    'Expected addCard non-2xx responses to keep backend error copy behavior',
  );
  assert.match(
    addBody.slice(addValidationIndex, addClearFormIndex),
    /error: completion\.error,/,
    'Expected malformed successful creates to use safe add-card failure copy',
  );

  assert.notEqual(saveAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in saveCard');
  assert.notEqual(saveJsonIndex, -1, 'Expected saveCard to parse response JSON');
  assert.notEqual(saveResponseOkIndex, -1, 'Expected saveCard to keep non-2xx handling');
  assert.notEqual(saveValidationIndex, -1, 'Expected saveCard to validate successful payloads');
  assert.notEqual(saveExpectedDeckIdIndex, -1, 'Expected saveCard to validate deck ownership metadata');
  assert.notEqual(saveExpectedCardIdIndex, -1, 'Expected saveCard to validate submitted card id metadata');
  assert.notEqual(saveMergeIndex, -1, 'Expected saveCard to merge only the parsed card');
  assert.notEqual(saveEditFormIndex, -1, 'Expected saveCard to overwrite forms only from the parsed card');
  assert.ok(saveAuthExpiredIndex < saveJsonIndex, 'Expected saveCard auth expiration before JSON parsing');
  assert.ok(saveJsonIndex < saveResponseOkIndex, 'Expected saveCard non-2xx handling after JSON parsing');
  assert.ok(saveResponseOkIndex < saveValidationIndex, 'Expected saveCard validation after non-2xx handling');
  assert.ok(saveValidationIndex < saveExpectedDeckIdIndex, 'Expected saveCard deck id validation to be parser-owned');
  assert.ok(saveExpectedDeckIdIndex < saveExpectedCardIdIndex, 'Expected saveCard deck and card ids to both be validated');
  assert.ok(saveValidationIndex < saveMergeIndex, 'Expected saveCard validation before merging card data');
  assert.ok(saveValidationIndex < saveEditFormIndex, 'Expected saveCard validation before edit form writes');
  assert.match(
    saveBody.slice(saveResponseOkIndex, saveValidationIndex),
    /error: getDeckCardMutationFailureMessage\(data\),/,
    'Expected saveCard non-2xx responses to use safe backend error copy behavior',
  );
  assert.match(
    saveBody.slice(saveValidationIndex, saveMergeIndex),
    /error: 'Unable to save card\.'/,
    'Expected malformed successful saves to use safe save-card failure copy',
  );
});

test('deck mutations classify responses before updating visible state', () => {
  const createBody = extractConstFunctionBody('createDeck');
  const renameBody = extractConstFunctionBody('renameDeck');
  const createAuthExpiredIndex = createBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const createJsonIndex = createBody.indexOf('const data = await response.json().catch(() => ({}));');
  const createCompletionIndex = createBody.indexOf('const createCompletion = getCreateDeckResponseCompletion({');
  const createServerErrorIndex = createBody.indexOf(
    'createCompletion.type === CREATE_DECK_COMPLETION_TYPES.SERVER_ERROR',
  );
  const createInvalidResponseIndex = createBody.indexOf(
    'createCompletion.type === CREATE_DECK_COMPLETION_TYPES.INVALID_RESPONSE',
  );
  const createClearInputIndex = createBody.indexOf("setNewDeckName('');");
  const createLocalStateIndex = createBody.indexOf(
    'addCreatedDeck(currentDecks, createdDeck, submission.name)',
  );
  const createSilentRefreshIndex = createBody.indexOf('void fetchDecks({ silent: true });');
  const createSuccessIndex = createBody.indexOf('showCreateDeckSuccess();');
  const renameAuthExpiredIndex = renameBody.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const renameJsonIndex = renameBody.indexOf('const data = await response.json().catch(() => ({}));');
  const renameCompletionIndex = renameBody.indexOf('const renameCompletion = getRenameDeckResponseCompletion({');
  const renameServerErrorIndex = renameBody.indexOf(
    'renameCompletion.type === RENAME_DECK_COMPLETION_TYPES.SERVER_ERROR',
  );
  const renameInvalidResponseIndex = renameBody.indexOf(
    'renameCompletion.type === RENAME_DECK_COMPLETION_TYPES.INVALID_RESPONSE',
  );
  const renameClearFormIndex = renameBody.indexOf('clearRenameDeckState(deckId);', renameCompletionIndex);
  const renameLocalStateIndex = renameBody.indexOf(
    'mergeRenamedDeck(currentDecks, deckId, renamedDeck, submission.name)',
  );
  const renameSilentRefreshIndex = renameBody.indexOf('void fetchDecks({ silent: true });');

  assert.match(
    deckSource,
    /getCreateDeckResponseCompletion,/,
    'Expected deck.js to import the create-deck response completion helper',
  );
  assert.match(
    deckSource,
    /getRenameDeckResponseCompletion,/,
    'Expected deck.js to import the rename-deck response completion helper',
  );

  assert.notEqual(createAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in createDeck');
  assert.notEqual(createJsonIndex, -1, 'Expected createDeck to parse response JSON');
  assert.notEqual(createCompletionIndex, -1, 'Expected createDeck to classify response completions');
  assert.notEqual(createServerErrorIndex, -1, 'Expected createDeck to keep non-2xx handling');
  assert.notEqual(createInvalidResponseIndex, -1, 'Expected createDeck to handle malformed successful payloads');
  assert.notEqual(createClearInputIndex, -1, 'Expected createDeck to clear the input only after successful completion');
  assert.notEqual(createLocalStateIndex, -1, 'Expected createDeck to add only completion deck data locally');
  assert.notEqual(createSilentRefreshIndex, -1, 'Expected createDeck to silently refresh only after successful completion');
  assert.notEqual(createSuccessIndex, -1, 'Expected createDeck to show success only after successful completion');
  assert.ok(createAuthExpiredIndex < createJsonIndex, 'Expected createDeck auth expiration before JSON parsing');
  assert.ok(createJsonIndex < createCompletionIndex, 'Expected createDeck completion classification after JSON parsing');
  assert.ok(createCompletionIndex < createClearInputIndex, 'Expected createDeck classification before clearing input');
  assert.ok(createCompletionIndex < createLocalStateIndex, 'Expected createDeck classification before local insertion');
  assert.ok(createCompletionIndex < createSilentRefreshIndex, 'Expected createDeck classification before silent refresh');
  assert.ok(createCompletionIndex < createSuccessIndex, 'Expected createDeck classification before success status');
  assert.match(
    createBody.slice(createCompletionIndex, createClearInputIndex),
    /error: createCompletion\.error,/,
    'Expected createDeck completion errors to surface through status without clearing input',
  );
  assert.match(
    createBody.slice(createCompletionIndex, createClearInputIndex),
    /const \{ createdDeck \} = createCompletion;/,
    'Expected createDeck to use only the validated completion deck',
  );

  assert.notEqual(renameAuthExpiredIndex, -1, 'Expected auth-expired handling to remain in renameDeck');
  assert.notEqual(renameJsonIndex, -1, 'Expected renameDeck to parse response JSON');
  assert.notEqual(renameCompletionIndex, -1, 'Expected renameDeck to classify response completions');
  assert.notEqual(renameServerErrorIndex, -1, 'Expected renameDeck to keep non-2xx handling');
  assert.notEqual(renameInvalidResponseIndex, -1, 'Expected renameDeck to handle malformed successful payloads');
  assert.notEqual(renameClearFormIndex, -1, 'Expected renameDeck to keep the form open until completion succeeds');
  assert.notEqual(renameLocalStateIndex, -1, 'Expected renameDeck to merge only completion deck data locally');
  assert.notEqual(renameSilentRefreshIndex, -1, 'Expected renameDeck to silently refresh only after successful completion');
  assert.ok(renameAuthExpiredIndex < renameJsonIndex, 'Expected renameDeck auth expiration before JSON parsing');
  assert.ok(renameJsonIndex < renameCompletionIndex, 'Expected renameDeck completion classification after JSON parsing');
  assert.ok(renameCompletionIndex < renameClearFormIndex, 'Expected renameDeck classification before clearing form state');
  assert.ok(renameCompletionIndex < renameLocalStateIndex, 'Expected renameDeck classification before local merge');
  assert.ok(renameCompletionIndex < renameSilentRefreshIndex, 'Expected renameDeck classification before silent refresh');
  assert.match(
    renameBody.slice(renameCompletionIndex, renameClearFormIndex),
    /\[deckId\]: renameCompletion\.error,/,
    'Expected renameDeck completion errors to surface without clearing form state',
  );
  assert.match(
    renameBody.slice(renameCompletionIndex, renameClearFormIndex),
    /const \{ renamedDeck \} = renameCompletion;/,
    'Expected renameDeck to use only the validated completion deck',
  );
});

test('deleteDeck classifies removal responses before updating visible state', () => {
  const body = extractConstFunctionBody('deleteDeck');
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));');
  const completionIndex = body.indexOf('const deckRemovalCompletion = getDeckRemovalResponseCompletion({');
  const serverErrorIndex = body.indexOf(
    'deckRemovalCompletion.type === DECK_REMOVAL_COMPLETION_TYPES.SERVER_ERROR',
  );
  const invalidResponseIndex = body.indexOf(
    'deckRemovalCompletion.type === DECK_REMOVAL_COMPLETION_TYPES.INVALID_RESPONSE',
  );
  const clearErrorIndex = body.indexOf('delete nextErrors[deckId];', completionIndex);
  const removeDeckIndex = body.indexOf('removeDeckFromList(currentDecks, deckId)');
  const removeCardsIndex = body.indexOf('delete nextCards[deckId];');
  const silentRefreshIndex = body.indexOf('void fetchDecks({ silent: true });');

  assert.match(
    deckSource,
    /require\(['"]\.\/deckRemovalResponse['"]\)/,
    'Expected deck.js to import deck-removal response helpers',
  );
  assert.match(
    deckSource,
    /getDeckRemovalResponseCompletion,/,
    'Expected deck.js to destructure the deck-removal response completion helper',
  );

  assert.notEqual(authExpiredIndex, -1, 'Expected auth-expired handling to remain in deleteDeck');
  assert.notEqual(jsonIndex, -1, 'Expected deleteDeck to parse response JSON');
  assert.notEqual(completionIndex, -1, 'Expected deleteDeck to classify response completions');
  assert.notEqual(serverErrorIndex, -1, 'Expected deleteDeck to keep non-2xx handling');
  assert.notEqual(invalidResponseIndex, -1, 'Expected deleteDeck to handle malformed successful payloads');
  assert.notEqual(clearErrorIndex, -1, 'Expected deleteDeck to clear errors only after completion succeeds');
  assert.notEqual(removeDeckIndex, -1, 'Expected deleteDeck to remove the deck only after completion succeeds');
  assert.notEqual(removeCardsIndex, -1, 'Expected deleteDeck to remove deck cards only after completion succeeds');
  assert.notEqual(silentRefreshIndex, -1, 'Expected deleteDeck to silently refresh only after completion succeeds');
  assert.ok(authExpiredIndex < jsonIndex, 'Expected deleteDeck auth expiration before JSON parsing');
  assert.ok(jsonIndex < completionIndex, 'Expected deleteDeck completion classification after JSON parsing');
  assert.ok(completionIndex < clearErrorIndex, 'Expected deleteDeck classification before clearing errors');
  assert.ok(completionIndex < removeDeckIndex, 'Expected deleteDeck classification before local deck removal');
  assert.ok(completionIndex < removeCardsIndex, 'Expected deleteDeck classification before local card cleanup');
  assert.ok(completionIndex < silentRefreshIndex, 'Expected deleteDeck classification before silent refresh');
  assert.match(
    body.slice(completionIndex, clearErrorIndex),
    /\[deckId\]: deckRemovalCompletion\.error,/,
    'Expected deleteDeck completion errors to surface without clearing visible state',
  );
  assert.match(
    body,
    /\[deckId\]: DECK_REMOVAL_MESSAGES\.networkFailed,/,
    'Expected deleteDeck network errors to keep existing safe copy',
  );
});

test('deleteCard validates successful removal payloads before updating visible state', () => {
  const body = extractConstFunctionBody('deleteCard');
  const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))');
  const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));');
  const responseOkIndex = body.indexOf('if (!response.ok) {');
  const validationIndex = body.search(
    /removalResult\s*=\s*parseDeckCardRemovalSuccessPayload\(data,\s*\{\s*expectedDeckId:\s*deckId,\s*expectedId:\s*cardId,\s*\}\);/,
  );
  const removeCardIndex = body.indexOf('removeLoadedCard(deckId, cardId);');
  const decrementCountsIndex = body.indexOf('decrementDeckCardCounts(currentDecks, deckId, removalResult.card)');
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
    /const \{[\s\S]*getDeckCardRemovalFailureMessage,[\s\S]*parseDeckCardRemovalSuccessPayload,[\s\S]*\} = deckCardRemovalResponse;/,
    'Expected deck.js to destructure the card-removal response helpers',
  );

  assert.notEqual(authExpiredIndex, -1, 'Expected auth-expired handling to remain in deleteCard');
  assert.notEqual(jsonIndex, -1, 'Expected deleteCard to parse response JSON');
  assert.notEqual(responseOkIndex, -1, 'Expected deleteCard to keep non-2xx handling');
  assert.notEqual(validationIndex, -1, 'Expected deleteCard to validate and keep successful payloads');
  assert.notEqual(removeCardIndex, -1, 'Expected deleteCard to remove cards only after validation');
  assert.notEqual(decrementCountsIndex, -1, 'Expected deleteCard to decrement counts with the deleted card returned by the server');
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
    /error: getDeckCardRemovalFailureMessage\(data\),/,
    'Expected deleteCard non-2xx responses to use safe backend error copy behavior',
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
    deleteCard: /setDecks\(\(currentDecks\) => decrementDeckCardCounts\(currentDecks, deckId, removalResult\.card\)\);[\s\S]*void fetchDecks\(\{\s*silent:\s*true\s*\}\);/,
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
