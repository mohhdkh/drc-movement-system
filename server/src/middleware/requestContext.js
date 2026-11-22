const { randomUUID } = require('crypto')
const { logger: defaultLogger } = require('../services/logger')

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/

function createRequestContext({ logger = defaultLogger, enabled = true, clock = () => process.hrtime.bigint() } = {}) {
  return function requestContext(request, response, next) {
    const incoming = request.get('x-request-id')
    request.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID()
    response.set('X-Request-ID', request.id)
    const started = clock()
    const requestPath = new URL(request.originalUrl, 'http://localhost').pathname
    response.once('finish', () => {
      if (!enabled) return
      const durationMs = Number(clock() - started) / 1e6
      const entityId = response.locals.entityId || requestPath.match(/\bMOV-[A-Z0-9]+\b/i)?.[0]
      logger.info('http_request', {
        requestId: request.id,
        method: request.method,
        route: requestPath,
        status: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        actorId: request.user?.id,
        entityId,
      })
    })
    next()
  }
}

module.exports = { REQUEST_ID_PATTERN, createRequestContext }
