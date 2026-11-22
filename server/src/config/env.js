const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true })

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function integer(value, fallback, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const candidate = value === undefined || value === '' ? fallback : Number(value)
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`)
  }
  return candidate
}

function boolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback
  return TRUE_VALUES.has(String(value).toLowerCase())
}

function parseOrigins(value, fallback) {
  const values = String(value || fallback || '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!values.length) throw new Error('CLIENT_ORIGIN must contain at least one HTTP or HTTPS origin.')
  return [...new Set(values.map((item) => {
    let parsed
    try { parsed = new URL(item) } catch { throw new Error('CLIENT_ORIGIN contains an invalid URL.') }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('CLIENT_ORIGIN entries must be HTTP(S) origins without credentials, paths, queries, or fragments.')
    }
    return parsed.origin
  }))]
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function byteLimit(value = '256kb') {
  if (!/^\d+(b|kb|mb)$/i.test(value)) throw new Error('API_JSON_LIMIT must be a byte, kb, or mb value.')
  return value.toLowerCase()
}

function buildRuntimeConfig(env = process.env, options = {}) {
  const nodeEnv = env.NODE_ENV || 'development'
  const isTestProcess = options.isTestProcess ?? Boolean(env.NODE_TEST_CONTEXT)
  const clientOrigins = parseOrigins(env.CLIENT_ORIGIN, 'http://localhost:5173')
  const movementTimeZone = env.MOVEMENT_TIMEZONE || 'Asia/Gaza'
  const authProvider = String(env.AUTH_PROVIDER || env.AUTH_MODE || 'development').toLowerCase()
  if (!['development', 'entra'].includes(authProvider)) {
    throw new Error('AUTH_PROVIDER must be development or entra.')
  }
  if (!validTimeZone(movementTimeZone)) throw new Error('MOVEMENT_TIMEZONE must be a valid IANA timezone.')

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    authProvider,
    authMode: authProvider,
    host: env.HOST || '0.0.0.0',
    port: integer(env.PORT, 5000, 'PORT', { min: 1, max: 65535 }),
    clientOrigin: clientOrigins[0],
    clientOrigins,
    movementTimeZone,
    movementCutoffHour: integer(env.MOVEMENT_CUTOFF_HOUR, 12, 'MOVEMENT_CUTOFF_HOUR', { max: 23 }),
    databaseProvider: isTestProcess ? 'sqlite' : (env.DATABASE_PROVIDER || 'sqlite').toLowerCase(),
    jsonBodyLimit: byteLimit(env.API_JSON_LIMIT || '256kb'),
    rateLimitEnabled: boolean(env.RATE_LIMIT_ENABLED, nodeEnv === 'production'),
    rateLimitWindowMs: integer(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'RATE_LIMIT_WINDOW_MS', { min: 1000 }),
    rateLimitMax: integer(env.RATE_LIMIT_MAX, 300, 'RATE_LIMIT_MAX', { min: 1 }),
    shutdownTimeoutMs: integer(env.SHUTDOWN_TIMEOUT_MS, 15000, 'SHUTDOWN_TIMEOUT_MS', { min: 1000 }),
    trustProxyHops: integer(env.TRUST_PROXY_HOPS, 0, 'TRUST_PROXY_HOPS', { max: 10 }),
    logRequests: boolean(env.LOG_REQUESTS, nodeEnv === 'production'),
    serveClient: boolean(env.SERVE_CLIENT, false),
    clientDistPath: path.resolve(
      env.CLIENT_DIST_PATH || path.resolve(__dirname, '../../../client/dist'),
    ),
  }
}

function validateProductionConfiguration(config, env = process.env) {
  if (!config.isProduction) return config
  const required = [
    'PORT', 'CLIENT_ORIGIN', 'DATABASE_PROVIDER', 'DATABASE_URL',
    'MOVEMENT_TIMEZONE', 'MOVEMENT_CUTOFF_HOUR', 'AUTH_PROVIDER',
  ]
  const missing = required.filter((name) => !String(env[name] || '').trim())
  if (missing.length) throw new Error(`Production configuration is missing: ${missing.join(', ')}.`)
  if (config.databaseProvider !== 'postgres') throw new Error('Production requires DATABASE_PROVIDER=postgres.')
  if (config.authProvider !== 'entra') throw new Error('Production requires AUTH_PROVIDER=entra.')
  const { getEntraConfig, validateEntraConfig } = require('./entra')
  const entraErrors = validateEntraConfig(getEntraConfig(env))
  if (entraErrors.length) throw new Error(`Production Entra configuration is incomplete: ${entraErrors.join(', ')}.`)
  const databaseUrl = String(env.DATABASE_URL)
  if (/sslmode=disable/i.test(databaseUrl) || /^(0|false|no|disable|disabled)$/i.test(String(env.PGSSL || ''))) {
    throw new Error('Production PostgreSQL connections must use certificate-verified TLS.')
  }
  if (/^(no-verify|allow-self-signed)$/i.test(String(env.PGSSL || ''))) {
    throw new Error('Production PostgreSQL certificate verification cannot be disabled.')
  }
  if (config.clientOrigins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('Production CLIENT_ORIGIN entries must use HTTPS.')
  }
  return config
}

const config = buildRuntimeConfig()

module.exports = {
  ...config,
  buildRuntimeConfig,
  parseOrigins,
  validateProductionConfiguration,
}
