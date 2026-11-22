const { databaseProvider } = require('../config/env')

const SUPPORTED_PROVIDERS = new Set(['sqlite', 'postgres'])
let provider

function validateProviderName(name) {
  if (!SUPPORTED_PROVIDERS.has(name)) {
    throw new Error(`DATABASE_PROVIDER must be sqlite or postgres; received ${name}.`)
  }
}

function createProvider(name = databaseProvider, options = {}) {
  validateProviderName(name)
  if (name === 'postgres') {
    const { PostgresOperationalProvider } = require('./providers/postgresOperationalProvider')
    return new PostgresOperationalProvider(options)
  }
  const { SqliteOperationalProvider } = require('./providers/sqliteOperationalProvider')
  return new SqliteOperationalProvider(options)
}

function getOperationalProvider() {
  if (!provider) {
    if (databaseProvider === 'postgres') {
      throw new Error('PostgreSQL provider must be initialized before loading the Express application.')
    }
    provider = createProvider(databaseProvider)
  }
  return provider
}

async function initializeOperationalDatabase(options = {}) {
  if (!provider) provider = createProvider(databaseProvider, options)
  await provider.initialize()
  return provider
}

async function getOperationalDatabaseStatus() {
  return getOperationalProvider().status()
}

async function shutdownOperationalDatabase() {
  if (provider) await provider.close()
}

function setOperationalProviderForTests(value) {
  provider = value
}

module.exports = {
  createProvider,
  getOperationalDatabaseStatus,
  getOperationalProvider,
  initializeOperationalDatabase,
  setOperationalProviderForTests,
  shutdownOperationalDatabase,
  validateProviderName,
}
