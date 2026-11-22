const fs = require('fs')
const path = require('path')
const { withTransaction } = require('./pool')

const migrationDirectory = path.resolve(__dirname, 'migrations')

function migrationFiles() {
  return fs.readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function getMigrationStatus(pool) {
  const expected = migrationFiles()
  const exists = await pool.query(`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists
  `)
  if (!exists.rows[0].exists) {
    return { expected, applied: [], pending: expected, upToDate: false }
  }
  const result = await pool.query('SELECT version, applied_at FROM schema_migrations ORDER BY version')
  const applied = result.rows.map((row) => row.version)
  return {
    expected,
    applied,
    pending: expected.filter((version) => !applied.includes(version)),
    upToDate: expected.every((version) => applied.includes(version)),
  }
}

async function runPostgresMigrations(pool) {
  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['drc-postgres-migrations'])
    await ensureMigrationTable(client)
  })

  const initialStatus = await getMigrationStatus(pool)
  for (const version of initialStatus.pending) {
    await withTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['drc-postgres-migrations'])
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version],
      )
      if (alreadyApplied.rowCount) return
      await client.query(fs.readFileSync(path.join(migrationDirectory, version), 'utf8'))
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
    })
  }
  return getMigrationStatus(pool)
}

module.exports = { getMigrationStatus, migrationFiles, runPostgresMigrations }
