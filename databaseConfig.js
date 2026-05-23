const DATABASE_URL_ENV = 'DATABASE_URL';
const REQUIRED_DATABASE_URL_ERROR = 'DATABASE_URL is required when NODE_ENV=production';

function hasConfiguredDatabaseUrl(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getOwnDataPropertyValue(config, propertyName) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(config, propertyName);

  // Reject accessors so untrusted getters or prototype-polluted config are never invoked.
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return undefined;
  }

  return descriptor.value;
}

function buildDatabasePoolConfig(config = process.env) {
  const databaseUrl = getOwnDataPropertyValue(config, DATABASE_URL_ENV);

  if (hasConfiguredDatabaseUrl(databaseUrl)) {
    // Treat all-whitespace values as unconfigured; pass non-empty values through exactly to pg.
    return { connectionString: databaseUrl };
  }

  if (getOwnDataPropertyValue(config, 'NODE_ENV') === 'production') {
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
