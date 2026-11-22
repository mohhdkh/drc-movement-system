const runtimeConfig = require('./config/env')
const { validateProductionConfiguration } = runtimeConfig
const {
  initializeOperationalDatabase,
  shutdownOperationalDatabase,
} = require('./db/operationalDatabase')
const { gracefulShutdown } = require('./serverLifecycle')
const { logger } = require('./services/logger')
const { getSharePointConfig } = require('./integrations/sharepoint/sharePointConfig')

let activeServer
let shutdownPromise

async function start() {
  validateProductionConfiguration(runtimeConfig, process.env)
  try {
    await initializeOperationalDatabase()
    const app = require('./app')
    activeServer = await new Promise((resolve, reject) => {
      const server = app.listen(runtimeConfig.port, runtimeConfig.host, () => resolve(server))
      server.once('error', reject)
    })
  } catch (error) {
    await shutdownOperationalDatabase()
    throw error
  }
  logger.info('api_started', {
    environment: runtimeConfig.nodeEnv,
    authProvider: runtimeConfig.authProvider,
    databaseProvider: runtimeConfig.databaseProvider,
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    allowedOriginCount: runtimeConfig.clientOrigins.length,
    movementTimeZone: runtimeConfig.movementTimeZone,
    movementCutoffHour: runtimeConfig.movementCutoffHour,
    sharePointEnabled: getSharePointConfig().enabled,
  })
  return activeServer
}

async function shutdown(signal = 'APPLICATION_SHUTDOWN') {
  if (!activeServer) return true
  if (!shutdownPromise) {
    shutdownPromise = gracefulShutdown({
      server: activeServer,
      closeResources: shutdownOperationalDatabase,
      timeoutMs: runtimeConfig.shutdownTimeoutMs,
      signal,
      logger,
    })
  }
  return shutdownPromise
}

if (require.main === module) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      const clean = await shutdown(signal)
      if (!clean) process.exit(1)
      process.exitCode = 0
    })
  }
  start().catch((error) => {
    logger.error('api_startup_failed', {
      errorName: error.name,
      errorCode: error.code,
      errorMessage: error.message,
      stack: runtimeConfig.isProduction ? undefined : error.stack,
    })
    process.exitCode = 1
  })
}

module.exports = { shutdown, start }
