process.env.NODE_ENV = 'production'

const config = require('../config/env')

config.validateProductionConfiguration(config, process.env)
process.stdout.write(JSON.stringify({
  status: 'ok',
  environment: config.nodeEnv,
  authProvider: config.authProvider,
  databaseProvider: config.databaseProvider,
  allowedOriginCount: config.clientOrigins.length,
  movementTimeZone: config.movementTimeZone,
  movementCutoffHour: config.movementCutoffHour,
}) + '\n')
