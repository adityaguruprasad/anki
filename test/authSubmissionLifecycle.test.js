const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  beginAuthSubmission,
  invalidateAuthSubmissions,
  isCurrentAuthSubmission,
  isMountedAuthSubmission,
  runIfCurrentAuthSubmission,
} = require('../authSubmissionLifecycle');
const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('isMountedAuthSubmission accepts only mounted refs', () => {
  assert.equal(isMountedAuthSubmission({ current: true }), true);
  assert.equal(isMountedAuthSubmission({ current: false }), false);
  assert.equal(isMountedAuthSubmission(null), false);
  assert.equal(isMountedAuthSubmission({}), false);
});

test('beginAuthSubmission advances a per-submission sequence ref', () => {
  const sequenceRef = { current: 0 };

  assert.equal(beginAuthSubmission(sequenceRef), 1);
  assert.equal(sequenceRef.current, 1);
  assert.equal(beginAuthSubmission(sequenceRef), 2);
  assert.equal(sequenceRef.current, 2);
});

test('beginAuthSubmission recovers from an invalid sequence value', () => {
  const sequenceRef = { current: Number.MAX_SAFE_INTEGER + 1 };

  assert.equal(beginAuthSubmission(sequenceRef), 1);
  assert.equal(sequenceRef.current, 1);
  assert.equal(beginAuthSubmission(null), 0);
});

test('isCurrentAuthSubmission requires mounted component and latest sequence', () => {
  const mountedRef = { current: true };
  const sequenceRef = { current: 0 };
  const firstSequence = beginAuthSubmission(sequenceRef);

  assert.equal(
    isCurrentAuthSubmission({ mountedRef, sequenceRef, sequence: firstSequence }),
    true,
  );

  const secondSequence = beginAuthSubmission(sequenceRef);

  assert.equal(
    isCurrentAuthSubmission({ mountedRef, sequenceRef, sequence: firstSequence }),
    false,
  );
  assert.equal(
    isCurrentAuthSubmission({ mountedRef, sequenceRef, sequence: secondSequence }),
    true,
  );

  mountedRef.current = false;

  assert.equal(
    isCurrentAuthSubmission({ mountedRef, sequenceRef, sequence: secondSequence }),
    false,
  );
});

test('invalidateAuthSubmissions makes an in-flight sequence stale', () => {
  const mountedRef = { current: true };
  const sequenceRef = { current: 0 };
  const sequence = beginAuthSubmission(sequenceRef);

  assert.equal(invalidateAuthSubmissions(sequenceRef), 2);
  assert.equal(
    isCurrentAuthSubmission({ mountedRef, sequenceRef, sequence }),
    false,
  );
});

test('runIfCurrentAuthSubmission only runs completion side effects for current mounted submissions', () => {
  const calls = [];
  const staleMountedRef = { current: true };
  const staleSequenceRef = { current: 0 };
  const firstSequence = beginAuthSubmission(staleSequenceRef);
  beginAuthSubmission(staleSequenceRef);

  assert.equal(
    runIfCurrentAuthSubmission(
      { mountedRef: staleMountedRef, sequenceRef: staleSequenceRef, sequence: firstSequence },
      () => calls.push('stale'),
    ),
    false,
  );

  const mountedRef = { current: true };
  const sequenceRef = { current: 0 };
  const sequence = beginAuthSubmission(sequenceRef);
  const options = { mountedRef, sequenceRef, sequence };

  assert.equal(
    runIfCurrentAuthSubmission(options, () => calls.push('current')),
    true,
  );

  mountedRef.current = false;

  assert.equal(
    runIfCurrentAuthSubmission(options, () => calls.push('unmounted')),
    false,
  );
  assert.deepEqual(calls, ['current']);
});

test('Login wires auth submission lifecycle guards into async completions', () => {
  assert.match(
    mainSource,
    /require\(['"]\.\/authSubmissionLifecycle['"]\)/,
    'Expected Login to import the auth submission lifecycle helper',
  );
  assert.match(
    mainSource,
    /const mountedRef = useRef\(true\);/,
    'Expected Login to track mounted state',
  );
  assert.match(
    mainSource,
    /invalidateAuthSubmissions\(authSubmissionSequenceRef\);/,
    'Expected Login unmount cleanup to invalidate in-flight submissions',
  );
  assert.match(
    mainSource,
    /const authSubmissionSequence = beginAuthSubmission\(authSubmissionSequenceRef\);/,
    'Expected Login to assign each valid submission a sequence',
  );
  assert.match(
    mainSource,
    /if \(!isCurrentSubmission\(\)\) \{\s+return;\s+\}/,
    'Expected Login to stop stale async completions before stateful work',
  );
  assert.match(
    mainSource,
    /runIfCurrentAuthSubmission\(currentSubmissionOptions,\s*\(\) => \{/,
    'Expected successful auth completion to run behind the current-submission guard',
  );
  assert.ok(
    FRONTEND_MODULES.includes('authSubmissionLifecycle.js'),
    'Expected the auth submission lifecycle helper to be mirrored into CRA src',
  );
});
