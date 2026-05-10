const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_MODULES = Object.freeze([
  'main.js',
  'dashboard.js',
  'deck.js',
  'studySession.js',
  'authBoundaryState.js',
  'authExpiration.js',
  'authFormState.js',
  'authHeaders.js',
  'dashboardApiRequests.js',
  'dashboardAuxiliaryDisplayState.js',
  'dashboardDeckTarget.js',
  'dashboardStatsDisplayState.js',
  'schedulingInsightsSummary.js',
  'deckCardActionInFlightState.js',
  'deckCardBrowserDisplayState.js',
  'deckCardBrowserRequestState.js',
  'deckCardCreateState.js',
  'deckCardState.js',
  'deckCollectionState.js',
  'deckCreateState.js',
  'deckListLoadState.js',
  'deckManagementApiRequests.js',
  'deckNameValidation.js',
  'deckRemovalInFlightState.js',
  'deckRenameState.js',
  'studySessionApiRequests.js',
  'studySessionFeedback.js',
  'studySessionNotice.js',
  'studySessionShortcuts.js',
  'studySessionTarget.js',
]);

function syncCraSrc(rootDir = path.join(__dirname, '..')) {
  const outputDir = path.join(rootDir, 'src', '__app__');

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

if (require.main === module) {
  try {
    syncCraSrc();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  FRONTEND_MODULES,
  syncCraSrc,
};
