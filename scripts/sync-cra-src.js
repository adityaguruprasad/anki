const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT_DIR = path.join(__dirname, '..');
const CHECK_FLAG = '--check';
const SYNC_CRA_SRC_USAGE = `Usage: node scripts/sync-cra-src.js [${CHECK_FLAG}]`;

const FRONTEND_MODULES = Object.freeze([
  'main.js',
  'dashboard.js',
  'deck.js',
  'studySession.js',
  'authBoundaryState.js',
  'authExpiration.js',
  'authFormState.js',
  'authHeaders.js',
  'authPasswordValidation.js',
  'authReturnDestination.js',
  'authSubmissionLifecycle.js',
  'authTokenValidation.js',
  'recordDataProperty.js',
  'storageGetItem.js',
  'cardContentValidation.js',
  'cardIdentifier.js',
  'isoTimestampValidation.js',
  'spacedRepetition.js',
  'dashboardApiRequests.js',
  'dashboardAuxiliaryDisplayState.js',
  'dashboardDeckTarget.js',
  'dashboardRequestInFlightState.js',
  'dashboardReviewActivityDisplayState.js',
  'dashboardStatsDisplayState.js',
  'schedulingInsightsSummary.js',
  'deckCardActionInFlightState.js',
  'deckCardBrowseResponse.js',
  'deckCardBrowserOptions.js',
  'deckCardMutationResponse.js',
  'deckCardRemovalResponse.js',
  'deckCardBrowserDisplayState.js',
  'deckCardBrowserRequestState.js',
  'deckCardCreateState.js',
  'deckCardState.js',
  'deckCollectionState.js',
  'deckCreateState.js',
  'deckListLoadState.js',
  'deckManagementApiRequests.js',
  'deckManagementDeckListPayload.js',
  'deckManagementMutationLifecycle.js',
  'deckMutationResponse.js',
  'deckRemovalResponse.js',
  'deckNameValidation.js',
  'deckRemovalInFlightState.js',
  'deckRenameState.js',
  'studySessionApiRequests.js',
  'studySessionDueCards.js',
  'studySessionFeedback.js',
  'studySessionNotice.js',
  'studySessionRequestLifecycle.js',
  'studySessionShortcuts.js',
  'studySessionTarget.js',
]);

function getCraSrcOutputDir(rootDir = DEFAULT_ROOT_DIR) {
  return path.join(rootDir, 'src', '__app__');
}

function getCraSrcMirrorStatus(rootDir = DEFAULT_ROOT_DIR) {
  const outputDir = getCraSrcOutputDir(rootDir);
  const expectedFiles = new Set(FRONTEND_MODULES);
  const staleFiles = [];
  const unexpectedFiles = [];

  for (const fileName of FRONTEND_MODULES) {
    const sourcePath = path.join(rootDir, fileName);
    const targetPath = path.join(outputDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing frontend module: ${fileName}`);
    }

    if (!fs.existsSync(targetPath)) {
      staleFiles.push({ fileName, reason: 'missing from src/__app__' });
      continue;
    }

    const targetStat = fs.statSync(targetPath);
    if (!targetStat.isFile()) {
      staleFiles.push({ fileName, reason: 'not a file in src/__app__' });
      continue;
    }

    const source = fs.readFileSync(sourcePath);
    const target = fs.readFileSync(targetPath);
    if (!source.equals(target)) {
      staleFiles.push({ fileName, reason: 'content differs from root source' });
    }
  }

  if (fs.existsSync(outputDir)) {
    for (const fileName of fs.readdirSync(outputDir)) {
      if (!expectedFiles.has(fileName)) {
        unexpectedFiles.push(fileName);
      }
    }
  }

  return {
    outputDir,
    checkedFiles: [...FRONTEND_MODULES],
    staleFiles,
    unexpectedFiles,
  };
}

function formatCraSrcCheckFailure(status) {
  const staleDetails = status.staleFiles
    .map(({ fileName, reason }) => `${fileName} (${reason})`);
  const unexpectedDetails = status.unexpectedFiles
    .map((fileName) => `${fileName} (unexpected in src/__app__)`);
  const details = [...staleDetails, ...unexpectedDetails].join(', ');

  return [
    'CRA source mirror is stale.',
    'Run `node scripts/sync-cra-src.js` to update src/__app__.',
    `Differences: ${details}`,
  ].join(' ');
}

function checkCraSrc(rootDir = DEFAULT_ROOT_DIR) {
  const status = getCraSrcMirrorStatus(rootDir);

  if (status.staleFiles.length > 0 || status.unexpectedFiles.length > 0) {
    const error = new Error(formatCraSrcCheckFailure(status));
    error.status = status;
    throw error;
  }

  return status;
}

function syncCraSrc(rootDir = DEFAULT_ROOT_DIR) {
  const outputDir = getCraSrcOutputDir(rootDir);

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const fileName of FRONTEND_MODULES) {
    const sourcePath = path.join(rootDir, fileName);
    const targetPath = path.join(outputDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing frontend module: ${fileName}`);
    }

    fs.copyFileSync(sourcePath, targetPath);
  }

  return {
    outputDir,
    copiedFiles: [...FRONTEND_MODULES],
  };
}

function runSyncCraSrcCli(argv = process.argv.slice(2), rootDir = DEFAULT_ROOT_DIR) {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== CHECK_FLAG)) {
    throw new Error(SYNC_CRA_SRC_USAGE);
  }

  return argv[0] === CHECK_FLAG
    ? checkCraSrc(rootDir)
    : syncCraSrc(rootDir);
}

if (require.main === module) {
  try {
    runSyncCraSrcCli();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  CHECK_FLAG,
  FRONTEND_MODULES,
  SYNC_CRA_SRC_USAGE,
  checkCraSrc,
  getCraSrcMirrorStatus,
  runSyncCraSrcCli,
  syncCraSrc,
};
