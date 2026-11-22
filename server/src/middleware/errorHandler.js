const { logger } = require('../services/logger')

function normalizeError(error) {
  if (error?.type === 'entity.parse.failed') {
    return { statusCode: 400, code: 'INVALID_JSON', message: 'Request body contains invalid JSON.' }
  }
  if (error?.type === 'entity.too.large') {
    return { statusCode: 413, code: 'REQUEST_TOO_LARGE', message: 'Request body exceeds the configured limit.' }
  }
  const databaseUnavailable = error?.name === 'PostgresDatabaseError' ||
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '57P03', '53300'].includes(error?.code) ||
    /^08/.test(error?.code || '')
  if (databaseUnavailable) {
    return { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database service is temporarily unavailable.' }
  }
  const statusCode = Number(error?.statusCode || error?.status) || 500
  return {
    statusCode,
    code: error?.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    message: statusCode >= 500 ? 'Internal server error' : (error?.message || 'Request failed.'),
    details: error?.details,
  }
}

function errorHandler(error, request, response, _next) {
  const normalized = normalizeError(error)
  if (normalized.statusCode >= 500) {
    logger.error('http_error', {
      requestId: request.id,
      method: request.method,
      route: request.path,
      status: normalized.statusCode,
      errorName: error?.name,
      errorCode: error?.code,
      errorMessage: process.env.NODE_ENV === 'production' ? 'Internal server error' : error?.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    })
  }

  const payload = {
    status: 'error',
    code: normalized.code,
    message: normalized.message,
    requestId: request.id,
  }
  if (normalized.details) payload.errors = normalized.details
  response.status(normalized.statusCode).json(payload)
}

module.exports = { errorHandler, normalizeError }
