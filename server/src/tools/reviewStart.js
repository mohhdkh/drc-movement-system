process.env.NODE_ENV = 'production'

const config = require('../config/env')
const serverLifecycle = require('../server')
const { logger } = require('../services/logger')
const { main: migratePostgres } = require('./postgresMigrate')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    const clean = await serverLifecycle.shutdown(signal)
    if (!clean) process.exit(1)
    process.exitCode = 0
  })
}

async function main() {
  config.validateProductionConfiguration(config, process.env)
  await migratePostgres()
  await serverLifecycle.start()
}

main().catch((error) => {
  logger.error('review_environment_startup_failed', {
    errorName: error.name,
    errorCode: error.code,
    errorMessage: error.message,
  })
  process.exitCode = 1
})
