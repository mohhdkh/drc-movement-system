const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const seedData = require('./seedData')

const isTestProcess = Boolean(process.env.NODE_TEST_CONTEXT)
const configuredPath = process.env.DATABASE_PATH
const databasePath = configuredPath || (isTestProcess
  ? path.resolve(__dirname, `../../data/test-${process.pid}.sqlite`)
  : path.resolve(__dirname, '../../data/drc-movement.sqlite'))

fs.mkdirSync(path.dirname(databasePath), { recursive: true })
const database = new Database(databasePath)
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')

function transaction(callback) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = callback()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function runMigrations() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
  const migrationDirectory = path.resolve(__dirname, 'migrations')
  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  )

  for (const fileName of fs.readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
    if (applied.has(fileName)) continue
    transaction(() => {
      database.exec(fs.readFileSync(path.join(migrationDirectory, fileName), 'utf8'))
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(fileName, new Date().toISOString())
    })
  }
}

function insertTimestamped(table, fields, item) {
  const columns = ['id', ...fields.map((field) => field.column), 'active', 'created_at', 'updated_at']
  const values = [
    item.id,
    ...fields.map((field) => item[field.property]),
    Number(item.active),
    item.createdAt,
    item.updatedAt,
  ]
  database.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...values)
}

function seedDatabase() {
  const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get().count
  if (userCount > 0) return

  transaction(() => {
    for (const item of seedData.departments) insertTimestamped('departments', [{ property: 'name', column: 'name' }], item)
    for (const item of seedData.users) {
      database.prepare(`
        INSERT INTO users (id, name, email, phone, department_id, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, item.name, item.email, item.phone, item.departmentId, Number(item.active), item.createdAt, item.updatedAt)
      const roleStatement = database.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
      for (const role of item.roles) roleStatement.run(item.id, role)
    }
    for (const item of seedData.vehicles) insertTimestamped('vehicles', [
      { property: 'code', column: 'code' },
      { property: 'plateNumber', column: 'plate_number' },
      { property: 'model', column: 'model' },
    ], item)
    for (const item of seedData.drivers) insertTimestamped('drivers', [
      { property: 'name', column: 'name' },
      { property: 'phone', column: 'phone' },
    ], item)
    for (const item of seedData.gpsDevices) insertTimestamped('gps_devices', [
      { property: 'code', column: 'code' },
      { property: 'label', column: 'label' },
    ], item)
    for (const item of seedData.locations) insertTimestamped('locations', [
      { property: 'name', column: 'name' },
      { property: 'latitude', column: 'latitude' },
      { property: 'longitude', column: 'longitude' },
    ], item)
    database.prepare(`
      INSERT INTO system_settings (id, movement_timezone, movement_cutoff_hour, updated_at)
      VALUES ('system', ?, ?, ?)
    `).run(
      process.env.MOVEMENT_TIMEZONE || 'Asia/Gaza',
      Number(process.env.MOVEMENT_CUTOFF_HOUR) || 12,
      seedData.INITIAL_TIMESTAMP,
    )
  })
}

runMigrations()
seedDatabase()

if (isTestProcess && !configuredPath) {
  process.once('exit', () => {
    database.close()
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(`${databasePath}${suffix}`) } catch {}
    }
  })
}

module.exports = { database, databasePath, transaction }
