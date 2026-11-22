const { createPostgresPool, validatePostgresConnection } = require('../db/postgres/pool')
const { getMigrationStatus } = require('../db/postgres/migrationRunner')
const { redact } = require('../services/logger')

async function main() {
  const pool = createPostgresPool()
  try {
    const connection = await validatePostgresConnection(pool)
    const status = await getMigrationStatus(pool)
    console.log(JSON.stringify({
      connected: connection.connected,
      serverTime: connection.serverTime,
      migrations: status,
    }, null, 2))
    if (!status.upToDate) process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(redact(error.message))
  process.exitCode = 1
})
