const { logger: defaultLogger } = require('./services/logger')

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function gracefulShutdown({ server, closeResources, timeoutMs, signal, logger = defaultLogger }) {
  logger.info('shutdown_started', { signal, timeoutMs })
  let timeout
  let resourceClosePromise
  try {
    await Promise.race([
      (async () => {
        await closeHttpServer(server)
        resourceClosePromise = Promise.resolve().then(closeResources)
        await resourceClosePromise
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Graceful shutdown deadline exceeded.')), timeoutMs)
        timeout.unref?.()
      }),
    ])
    logger.info('shutdown_completed', { signal })
    return true
  } catch (error) {
    logger.error('shutdown_failed', { signal, errorMessage: error.message })
    server.closeAllConnections?.()
    resourceClosePromise ||= Promise.resolve().then(closeResources)
    let cleanupTimeout
    try {
      const cleanupCompleted = await Promise.race([
        resourceClosePromise.then(() => true),
        new Promise((resolve) => {
          cleanupTimeout = setTimeout(() => resolve(false), Math.min(1000, Math.max(50, timeoutMs)))
        }),
      ])
      if (!cleanupCompleted) logger.error('shutdown_resource_close_timed_out', { signal })
    } catch (closeError) {
      logger.error('shutdown_resource_close_failed', { errorMessage: closeError.message })
    } finally {
      clearTimeout(cleanupTimeout)
    }
    return false
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { closeHttpServer, gracefulShutdown }
