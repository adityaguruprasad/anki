const DATABASE_URL_ENV = 'DATABASE_URL';
const REQUIRED_DATABASE_URL_ERROR = 'DATABASE_URL is required when NODE_ENV=production';

function hasConfiguredDatabaseUrl(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildDatabasePoolConfig(config = process.env) {
  const databaseUrl = config[DATABASE_URL_ENV];

  if (hasConfiguredDatabaseUrl(databaseUrl)) {
    // Treat all-whitespace values as unconfigured; pass non-empty values through exactly to pg.
    return { connectionString: databaseUrl };
  }

  if (config.NODE_ENV === 'production') {
    throw new Error(REQUIRED_DATABASE_URL_ERROR);
  }

  return {};
}

module.exports = {
  DATABASE_URL_ENV,
  REQUIRED_DATABASE_URL_ERROR,
  buildDatabasePoolConfig,
  hasConfiguredDatabaseUrl,
};
