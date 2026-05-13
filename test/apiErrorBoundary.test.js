const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  INTERNAL_SERVER_ERROR,
  handleApiError,
} = require('../apiErrorBoundary');

function createRes(options = {}) {
  return {
    body: null,
    headersSent: Boolean(options.headersSent),
    statusCode: 200,
    statusCalls: [],
    jsonCalls: [],
    status(code) {
      this.statusCode = code;
      this.statusCalls.push(code);
      return this;
    },
    json(payload) {
      this.body = payload;
      this.jsonCalls.push(payload);
      return this;
    },
  };
}

test('handleApiError is an Express error handler', () => {
  assert.equal(handleApiError.length, 4);
});

test('handleApiError returns a sanitized JSON 500 and logs the original error', () => {
  const error = new Error('database password leaked in stack for /api/private-route');
  const res = createRes();
  const loggedErrors = [];
  const originalError = console.error;
  console.error = (loggedError) => {
    loggedErrors.push(loggedError);
  };
  let nextCall = null;

  try {
    handleApiError(error, { originalUrl: '/api/private-route' }, res, (nextError) => {
      nextCall = nextError;
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(nextCall, null);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: INTERNAL_SERVER_ERROR });
  assert.deepEqual(loggedErrors, [error]);
  assert.doesNotMatch(JSON.stringify(res.body), /database password|private-route|stack/i);
});

test('handleApiError delegates when response headers were already sent', () => {
  const error = new Error('stream failed after partial response');
  const res = createRes({ headersSent: true });
  const loggedErrors = [];
  const originalError = console.error;
  console.error = (loggedError) => {
    loggedErrors.push(loggedError);
  };
  let nextCall = null;

  try {
    handleApiError(error, {}, res, (nextError) => {
      nextCall = nextError;
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(nextCall, error);
  assert.deepEqual(loggedErrors, []);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.deepEqual(res.statusCalls, []);
  assert.deepEqual(res.jsonCalls, []);
});

test('server mounts the sanitized error boundary after API routes and scopes it to /api', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const errorBoundaryImportIndex = serverSource.indexOf(
    "const { handleApiError } = require('./apiErrorBoundary');",
  );
  const schedulingInsightsIndex = serverSource.indexOf("app.get('/api/scheduling-insights'");
  const apiNotFoundMountIndex = serverSource.indexOf("app.use('/api', handleApiNotFound);");
  const apiErrorMountIndex = serverSource.indexOf("app.use('/api', handleApiError);");
  const listenIndex = serverSource.indexOf('if (require.main === module)');

  assert.ok(errorBoundaryImportIndex >= 0, 'Expected server.js to import the API error boundary');
  assert.ok(
    schedulingInsightsIndex >= 0 && apiNotFoundMountIndex > schedulingInsightsIndex,
    'Expected API 404 handling to stay after protected routes',
  );
  assert.ok(
    apiErrorMountIndex > apiNotFoundMountIndex,
    'Expected sanitized error handling after API 404 handling',
  );
  assert.ok(
    listenIndex > apiErrorMountIndex,
    'Expected sanitized error handling before server startup wiring',
  );
  assert.equal(
    serverSource.includes('app.use(handleApiError);'),
    false,
    'Expected sanitized error handling not to be mounted as a global fallback',
  );
});
