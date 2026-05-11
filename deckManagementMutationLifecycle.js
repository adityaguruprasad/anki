function isMountedDeckManagementMutation(mountedRef) {
  return Boolean(mountedRef && mountedRef.current);
}

function normalizeMutationKey(mutationKey) {
  if (typeof mutationKey === 'string' && mutationKey.trim()) {
    return mutationKey;
  }

  if (typeof mutationKey === 'number' && Number.isFinite(mutationKey)) {
    return String(mutationKey);
  }

  return '';
}

function normalizeMutationSequence(sequence) {
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}

function getSequenceStoreKey(mutationKey) {
  return `mutation:${mutationKey}`;
}

function ensureMutationSequences(sequenceRef) {
  if (!sequenceRef || typeof sequenceRef !== 'object') {
    return null;
  }

  if (!sequenceRef.current || typeof sequenceRef.current !== 'object') {
    sequenceRef.current = Object.create(null);
  }

  return sequenceRef.current;
}

function getMutationSequences(sequenceRef) {
  if (!sequenceRef || typeof sequenceRef !== 'object') {
    return null;
  }

  if (!sequenceRef.current || typeof sequenceRef.current !== 'object') {
    return null;
  }

  return sequenceRef.current;
}

function beginDeckManagementMutation(sequenceRef, mutationKey) {
  const key = normalizeMutationKey(mutationKey);
  if (!key) {
    return { key: '', sequence: 0 };
  }

  const sequences = ensureMutationSequences(sequenceRef);
  if (!sequences) {
    return { key, sequence: 0 };
  }

  const storeKey = getSequenceStoreKey(key);
  const sequence = normalizeMutationSequence(sequences[storeKey]) + 1;
  sequences[storeKey] = sequence;

  return { key, sequence };
}

function invalidateDeckManagementMutations(sequenceRef) {
  if (!sequenceRef || typeof sequenceRef !== 'object') {
    return false;
  }

  sequenceRef.current = Object.create(null);
  return true;
}

function isCurrentDeckManagementMutation(options = {}) {
  const { mountedRef, sequenceRef, mutation } = options;
  const key = normalizeMutationKey(mutation?.key);
  const sequences = getMutationSequences(sequenceRef);

  return isMountedDeckManagementMutation(mountedRef)
    && Boolean(key)
    && Boolean(sequences)
    && sequences[getSequenceStoreKey(key)] === mutation.sequence;
}

module.exports = {
  beginDeckManagementMutation,
  invalidateDeckManagementMutations,
  isCurrentDeckManagementMutation,
  isMountedDeckManagementMutation,
};
