const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const fs = require('fs')
const path = require('path')
const { rateLimit } = require('express-rate-limit')
const runtimeConfig = require('./config/env')
const apiRoutes = require('./routes')
const { notFound } = require('./middleware/notFound')
const { errorHandler } = require('./middleware/errorHandler')
const { refreshOperationalData } = require('./middleware/refreshOperationalData')
const { createRequestContext } = require('./middleware/requestContext')
const { requireJsonContentType } = require('./middleware/httpHardening')
const { createReviewAccess } = require('./middleware/reviewAccess')
const { AppError } = require('./utils/AppError')

function createRateLimiter(config) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (request) => request.path.startsWith('/api/health'),
    handler: (request, response) => response.status(429).json({
      status: 'error',
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again later.',
      requestId: request.id,
    }),
  })
}

function serveProductionClient(app, config) {
  if (!config.serveClient) return

  const clientDistPath = config.clientDistPath
  const indexPath = path.join(clientDistPath, 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Built client was not found at ${indexPath}.`)
  }

  app.use(express.static(clientDistPath, {
    index: false,
    maxAge: '1y',
    immutable: true,
    setHeaders(response, filePath) {
      if (path.basename(filePath) === 'index.html') response.set('Cache-Control', 'no-cache')
    },
  }))
  app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
    response.set('Cache-Control', 'no-cache')
    response.sendFile(indexPath)
  })
}

function createApp(config = runtimeConfig) {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops)

  app.use(createRequestContext({ enabled: config.logRequests }))
  app.use(helmet({ strictTransportSecurity: config.isProduction ? undefined : false }))
  app.use(createReviewAccess(config))
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true)
      return callback(new AppError('Origin is not allowed.', 403, undefined, 'CORS_ORIGIN_DENIED'))
    },
    exposedHeaders: ['X-Request-ID', 'Content-Disposition'],
  }))
  app.use(requireJsonContentType)
  app.use(express.json({ limit: config.jsonBodyLimit, type: 'application/json' }))
  if (config.rateLimitEnabled) app.use(createRateLimiter(config))
  app.use(refreshOperationalData)

  app.use('/api', apiRoutes)

  app.use('/api', notFound)
  serveProductionClient(app, config)
  app.use(errorHandler)
  return app
}

const app = createApp()
module.exports = app
module.exports.createApp = createApp
module.exports.createRateLimiter = createRateLimiter
module.exports.serveProductionClient = serveProductionClient
