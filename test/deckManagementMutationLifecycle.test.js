const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  beginDeckManagementMutation,
  invalidateDeckManagementMutations,
  isCurrentDeckManagementMutation,
  isMountedDeckManagementMutation,
} = require('../deckManagementMutationLifecycle');
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

test('isMountedDeckManagementMutation accepts only mounted refs', () => {
  assert.equal(isMountedDeckManagementMutation({ current: true }), true);
  assert.equal(isMountedDeckManagementMutation({ current: false }), false);
  assert.equal(isMountedDeckManagementMutation(null), false);
  assert.equal(isMountedDeckManagementMutation({}), false);
});

test('beginDeckManagementMutation advances independent mutation keys', () => {
  const sequenceRef = { current: {} };

  assert.deepEqual(beginDeckManagementMutation(sequenceRef, 'create-deck'), {
    key: 'create-deck',
    sequence: 1,
  });
  assert.deepEqual(beginDeckManagementMutation(sequenceRef, 'rename-deck:1'), {
    key: 'rename-deck:1',
    sequence: 1,
  });
  assert.deepEqual(beginDeckManagementMutation(sequenceRef, 'create-deck'), {
    key: 'create-deck',
    sequence: 2,
  });
});

test('isCurrentDeckManagementMutation requires mounted state and latest key sequence', () => {
  const mountedRef = { current: true };
  const sequenceRef = { current: {} };
  const firstCreate = beginDeckManagementMutation(sequenceRef, 'create-deck');
  const firstRename = beginDeckManagementMutation(sequenceRef, 'rename-deck:1');

  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation: firstCreate }),
    true,
  );
  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation: firstRename }),
    true,
  );

  const secondCreate = beginDeckManagementMutation(sequenceRef, 'create-deck');

  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation: firstCreate }),
    false,
  );
  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation: secondCreate }),
    true,
  );
  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation: firstRename }),
    true,
  );

  mountedRef.current = false;

  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation: secondCreate }),
    false,
  );
});

test('invalidateDeckManagementMutations makes pending completions stale', () => {
  const mountedRef = { current: true };
  const sequenceRef = { current: {} };
  const mutation = beginDeckManagementMutation(sequenceRef, 'delete-card:7');

  assert.equal(invalidateDeckManagementMutations(sequenceRef), true);
  assert.equal(
    isCurrentDeckManagementMutation({ mountedRef, sequenceRef, mutation }),
    false,
  );
  assert.equal(invalidateDeckManagementMutations(null), false);
});

test('invalid mutation lifecycle inputs fail closed', () => {
  assert.deepEqual(beginDeckManagementMutation(null, 'save-card:9'), {
    key: 'save-card:9',
    sequence: 0,
  });
  assert.deepEqual(beginDeckManagementMutation({ current: {} }, ''), {
    key: '',
    sequence: 0,
  });
  assert.equal(isCurrentDeckManagementMutation(), false);
  assert.equal(
    isCurrentDeckManagementMutation({
      mountedRef: { current: true },
      sequenceRef: { current: {} },
      mutation: { key: '', sequence: 1 },
    }),
    false,
  );
});

test('DeckManagement wires mutation lifecycle guards and unmount invalidation', () => {
  assert.match(
    deckSource,
    /require\(['"]\.\/deckManagementMutationLifecycle['"]\)/,
    'Expected DeckManagement to import the mutation lifecycle helper',
  );
  assert.match(
    deckSource,
    /const isDeckMutationMountedRef = useRef\(false\);/,
    'Expected DeckManagement to track mounted state for mutations',
  );
  assert.match(
    deckSource,
    /const deckMutationSequenceRef = useRef\(\{\}\);/,
    'Expected DeckManagement to track mutation sequence keys',
  );
  assert.match(
    deckSource,
    /invalidateDeckManagementMutations\(deckMutationSequenceRef\);/,
    'Expected unmount cleanup to invalidate pending mutation completions',
  );
  assert.match(
    deckSource,
    /createDeckInFlightRef\.current = false;[\s\S]*cardCreateInFlightRef\.current = \{\};[\s\S]*renameDeckInFlightRef\.current = \{\};[\s\S]*deckRemovalInFlightRef\.current = \{\};[\s\S]*cardActionInFlightRef\.current = \{\};/,
    'Expected unmount cleanup to clear old in-flight mutation refs without setState',
  );
  assert.ok(
    FRONTEND_MODULES.includes('deckManagementMutationLifecycle.js'),
    'Expected the mutation lifecycle helper to be mirrored into CRA src',
  );
});

test('DeckManagement mutation handlers guard awaited completions and cleanup', () => {
  const expectations = {
    createDeck: 'showCreateDeckSuccess();',
    renameDeck: 'mergeRenamedDeck(currentDecks, deckId, renamedDeck, submission.name)',
    addCard: 'setCardForms((currentForms) => ({',
    saveCard: 'updateLoadedCard(deckId, card.id, savedCard);',
    deleteCard: 'removeLoadedCard(deckId, cardId);',
    deleteDeck: 'removeDeckFromList(currentDecks, deckId)',
  };

  for (const [functionName, successfulStateMutation] of Object.entries(expectations)) {
    const body = extractConstFunctionBody(functionName);
    const fetchIndex = body.indexOf('const response = await fetch(');
    const postFetchGuardIndex = body.indexOf('if (!isCurrentMutation()) {', fetchIndex);
    const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))', fetchIndex);
    const jsonIndex = body.indexOf('const data = await response.json().catch(() => ({}));', fetchIndex);
    const postJsonGuardIndex = body.indexOf('if (!isCurrentMutation()) {', jsonIndex);
    const nonOkIndex = body.indexOf('if (!response.ok) {', fetchIndex);
    const successIndex = body.indexOf(successfulStateMutation);
    const successGuardIndex = body.lastIndexOf('if (!isCurrentMutation()) {', successIndex);
    const catchIndex = body.indexOf('} catch (error) {');
    const catchGuardIndex = body.indexOf('if (!isCurrentMutation()) {', catchIndex);
    const catchCompletionGuardIndex = body.indexOf('getCardCreateNetworkFailureCompletion({', catchIndex);
    const finallyIndex = body.indexOf('} finally {');
    const finallyGuardIndex = body.indexOf('if (isCurrentMutation()) {', finallyIndex);
    const finallyCompletionGuardIndex = body.indexOf(
      'shouldRunCardCreateFinallyCleanup({ isCurrent: isCurrentMutation() })',
      finallyIndex,
    );
    const usesCardCreateCompletionGuard = functionName === 'addCard';

    assert.match(
      body,
      /const isCurrentMutation = beginDeckMutationGuard\(/,
      `Expected ${functionName} to claim a mutation lifecycle guard`,
    );
    assert.notEqual(fetchIndex, -1, `Expected ${functionName} to perform a fetch`);
    assert.notEqual(postFetchGuardIndex, -1, `Expected ${functionName} to guard after fetch resolution`);
    assert.notEqual(authExpiredIndex, -1, `Expected ${functionName} to keep auth-expiration handling`);
    assert.notEqual(jsonIndex, -1, `Expected ${functionName} to parse the response body`);
    assert.notEqual(postJsonGuardIndex, -1, `Expected ${functionName} to guard after body parsing`);
    assert.notEqual(nonOkIndex, -1, `Expected ${functionName} to keep non-OK handling`);
    assert.notEqual(successIndex, -1, `Expected ${functionName} to keep successful UI updates`);
    assert.notEqual(successGuardIndex, -1, `Expected ${functionName} to guard successful UI updates`);
    assert.notEqual(catchIndex, -1, `Expected ${functionName} to keep catch handling`);
    assert.notEqual(finallyIndex, -1, `Expected ${functionName} to keep finally cleanup`);
    if (usesCardCreateCompletionGuard) {
      assert.notEqual(
        catchCompletionGuardIndex,
        -1,
        `Expected ${functionName} to guard catch UI updates through the card-create helper`,
      );
      assert.notEqual(
        finallyCompletionGuardIndex,
        -1,
        `Expected ${functionName} to guard finally cleanup through the card-create helper`,
      );
    } else {
      assert.notEqual(catchGuardIndex, -1, `Expected ${functionName} to guard catch UI updates`);
      assert.notEqual(finallyGuardIndex, -1, `Expected ${functionName} to guard finally cleanup`);
    }
    assert.ok(fetchIndex < postFetchGuardIndex, `Expected ${functionName} guard after fetch`);
    assert.ok(postFetchGuardIndex < authExpiredIndex, `Expected ${functionName} to skip stale auth side effects`);
    assert.ok(authExpiredIndex < jsonIndex, `Expected ${functionName} auth handling before body parsing`);
    assert.ok(jsonIndex < postJsonGuardIndex, `Expected ${functionName} guard after body parsing`);
    assert.ok(postJsonGuardIndex < nonOkIndex, `Expected ${functionName} to skip stale non-OK handling`);
    assert.ok(successGuardIndex < successIndex, `Expected ${functionName} to guard before success state mutation`);
    if (usesCardCreateCompletionGuard) {
      assert.ok(
        catchIndex < catchCompletionGuardIndex,
        `Expected ${functionName} to guard catch side effects`,
      );
      assert.ok(
        finallyIndex < finallyCompletionGuardIndex,
        `Expected ${functionName} to guard finally cleanup`,
      );
    } else {
      assert.ok(catchIndex < catchGuardIndex, `Expected ${functionName} to guard catch side effects`);
      assert.ok(finallyIndex < finallyGuardIndex, `Expected ${functionName} to guard finally cleanup`);
    }
  }
});
