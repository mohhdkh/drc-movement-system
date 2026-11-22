const { createPostgresPool, validatePostgresConnection } = require('../db/postgres/pool')
const { getMigrationStatus } = require('../db/postgres/migrationRunner')
const { redact } = require('../services/logger')
const { getCounts, getSnapshot, validateSnapshot } = require('../db/migration/sqliteSource')
const { getExistingIdCounts, importSnapshot } = require('../db/migration/sqliteToPostgres')

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const snapshot = getSnapshot()
  const sourceCounts = getCounts()
  const conflicts = validateSnapshot(snapshot)
  const pool = createPostgresPool()
  try {
    await validatePostgresConnection(pool)
    const migrations = await getMigrationStatus(pool)
    if (!migrations.upToDate) throw new Error(`PostgreSQL migrations are pending: ${migrations.pending.join(', ')}`)
    const existingIds = await getExistingIdCounts(pool, snapshot)
    console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'import', sourceCounts, existingIds, conflicts }, null, 2))
    if (conflicts.length) throw new Error('SQLite source validation found duplicate/conflicting identifiers.')
    if (dryRun) {
      console.log('Dry run complete. PostgreSQL writes performed: 0.')
      return
    }
    await importSnapshot(pool, snapshot)
    console.log('SQLite to PostgreSQL import committed successfully. SQLite data was not modified.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(redact(error.message))
  process.exitCode = 1
})
