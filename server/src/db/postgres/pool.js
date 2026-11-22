const { Pool } = require('pg')
const { getPostgresConfig } = require('./config')
const { logger, redact } = require('../../services/logger')

const TRANSIENT_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN',
  '08000', '08001', '08003', '08004', '08006', '08007',
  '57P01', '57P02', '57P03', '53300',
])

function isTransientPostgresError(error) {
  if (TRANSIENT_CODES.has(error?.code)) return true
  return /connection (?:terminated|timeout)|connection timed out|timeout exceeded when trying to connect|socket hang up/i
    .test(error?.message || '')
}

function readableDatabaseError(error, operation = 'PostgreSQL operation') {
  const code = error?.code ? ` (${error.code})` : ''
  const message = redact(error?.message || 'Unknown database error.')
  const wrapped = new Error(`${operation} failed${code}: ${message}`)
  wrapped.name = 'PostgresDatabaseError'
  wrapped.code = error?.code
  wrapped.cause = error
  return wrapped
}

function createPostgresPool(options = {}) {
  const pool = options.pool || new Pool(options.config || getPostgresConfig())
  pool.on?.('error', (error) => {
    const safe = readableDatabaseError(error, 'PostgreSQL idle connection')
    logger.error('postgres_idle_connection_error', { errorCode: safe.code, errorMessage: safe.message })
  })
  return pool
}

async function withTransaction(pool, callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch {}
    throw error
  } finally {
    client.release()
  }
}

async function validatePostgresConnection(pool, options = {}) {
  return retryTransientPostgresOperation(async () => {
    const result = await pool.query('SELECT NOW() AS server_time, current_database() AS database_name')
    return { connected: true, serverTime: result.rows[0].server_time }
  }, { ...options, operation: 'PostgreSQL startup validation' })
}

async function retryTransientPostgresOperation(callback, options = {}) {
  const attempts = options.attempts || 3
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callback()
    } catch (error) {
      if (attempt === attempts || !isTransientPostgresError(error)) {
        throw readableDatabaseError(error, options.operation || 'PostgreSQL operation')
      }
      logger.warn('postgres_connection_retry', {
        attempt,
        attempts,
        operation: options.operation,
        errorCode: error.code,
      })
      await sleep(Math.min(250 * (2 ** (attempt - 1)), 1000))
    }
  }
}

module.exports = {
  createPostgresPool,
  isTransientPostgresError,
  TRANSIENT_CODES,
  readableDatabaseError,
  retryTransientPostgresOperation,
  validatePostgresConnection,
  withTransaction,
}
