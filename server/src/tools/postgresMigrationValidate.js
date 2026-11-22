const fs = require('fs')
const path = require('path')
const { migrationFiles } = require('../db/postgres/migrationRunner')

const requiredTables = [
  'departments', 'users', 'user_roles', 'vehicles', 'drivers', 'gps_devices', 'locations',
  'system_settings', 'audit_logs', 'movements', 'movement_segments',
  'movement_segment_passengers', 'safety_reviews', 'supply_chain_assignments',
  'area_manager_approvals', 'movement_status_history',
]

const files = migrationFiles()
if (!files.length || files.some((file, index) => !/^\d{3}_.+\.sql$/.test(file) || (index && file <= files[index - 1]))) {
  throw new Error('PostgreSQL migration filenames must be non-empty and strictly ordered.')
}
const sql = files.map((file) => fs.readFileSync(path.resolve(__dirname, '../db/postgres/migrations', file), 'utf8')).join('\n')
const missing = requiredTables.filter((table) => !new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(sql))
if (missing.length) throw new Error(`PostgreSQL migration schema is missing: ${missing.join(', ')}`)
for (const field of ['arrival_time TIME NOT NULL', 'departure_time TIME NOT NULL', 'before_json JSONB', 'after_json JSONB']) {
  if (!sql.includes(field)) throw new Error(`PostgreSQL migration is missing required definition: ${field}`)
}
console.log(`PostgreSQL migration files validated offline: ${files.join(', ')}`)
