const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  API_ROUTE_NOT_FOUND_ERROR,
  handleApiNotFound,
} = require('../apiNotFound');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('handleApiNotFound returns a sanitized JSON 404 response', () => {
  const res = createRes();

  handleApiNotFound({ originalUrl: '/api/unknown/private-route' }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: API_ROUTE_NOT_FOUND_ERROR });
  assert.doesNotMatch(JSON.stringify(res.body), /unknown|private-route/i);
});

test('server mounts the API 404 boundary after protected API routes and scopes it to /api', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const authIndex = serverSource.indexOf('app.use(authenticateToken);');
  const schedulingInsightsIndex = serverSource.indexOf("app.get('/api/scheduling-insights'");
  const apiNotFoundMountIndex = serverSource.indexOf("app.use('/api', handleApiNotFound);");
  const listenIndex = serverSource.indexOf('if (require.main === module)');

  assert.ok(authIndex >= 0, 'Expected server.js to mount authenticateToken');
  assert.ok(
    schedulingInsightsIndex > authIndex,
    'Expected scheduling insights to remain behind authenticateToken',
  );
  assert.ok(
    apiNotFoundMountIndex > schedulingInsightsIndex,
    'Expected API 404 boundary after representative protected API routes',
  );
  assert.ok(
    listenIndex > apiNotFoundMountIndex,
    'Expected API 404 boundary before server startup wiring',
  );
  assert.match(
    serverSource,
    /app\.use\('\/api', handleApiNotFound\);/,
    'Expected API 404 boundary to be mounted only under /api',
  );
  assert.equal(
    serverSource.includes('app.use(handleApiNotFound);'),
    false,
    'Expected API 404 boundary not to be mounted as a global fallback',
  );
});
