const { createPostgresPool, validatePostgresConnection } = require('../db/postgres/pool')
const { runPostgresMigrations } = require('../db/postgres/migrationRunner')
const { redact } = require('../services/logger')

async function main() {
  const pool = createPostgresPool()
  try {
    await validatePostgresConnection(pool)
    const status = await runPostgresMigrations(pool)
    console.log(`PostgreSQL migrations are current (${status.applied.length}/${status.expected.length}).`)
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redact(error.message))
    process.exitCode = 1
  })
}

module.exports = { main }
