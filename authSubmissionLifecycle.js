function isMountedAuthSubmission(mountedRef) {
  return Boolean(mountedRef && mountedRef.current);
}

function advanceAuthSubmissionSequence(sequenceRef) {
  if (!sequenceRef || typeof sequenceRef !== 'object') {
    return 0;
  }

  const currentSequence = Number.isSafeInteger(sequenceRef.current) ? sequenceRef.current : 0;
  const nextSequence = currentSequence + 1;

  sequenceRef.current = nextSequence;
  return nextSequence;
}

function beginAuthSubmission(sequenceRef) {
  return advanceAuthSubmissionSequence(sequenceRef);
}

function invalidateAuthSubmissions(sequenceRef) {
  return advanceAuthSubmissionSequence(sequenceRef);
}

function isCurrentAuthSubmission({ mountedRef, sequenceRef, sequence } = {}) {
  return isMountedAuthSubmission(mountedRef)
    && Boolean(sequenceRef)
    && sequenceRef.current === sequence;
}

function runIfCurrentAuthSubmission(options, callback) {
  if (!isCurrentAuthSubmission(options) || typeof callback !== 'function') {
    return false;
  }

  callback();
  return true;
}

module.exports = {
  beginAuthSubmission,
  invalidateAuthSubmissions,
  isCurrentAuthSubmission,
  isMountedAuthSubmission,
  runIfCurrentAuthSubmission,
};
