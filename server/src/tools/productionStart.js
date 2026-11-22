process.env.NODE_ENV = 'production'

const serverLifecycle = require('../server')
const { logger } = require('../services/logger')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    const clean = await serverLifecycle.shutdown(signal)
    if (!clean) process.exit(1)
    process.exitCode = 0
  })
}

serverLifecycle.start().catch((error) => {
  logger.error('api_startup_failed', {
    errorName: error.name,
    errorCode: error.code,
    errorMessage: error.message,
  })
  process.exitCode = 1
})
