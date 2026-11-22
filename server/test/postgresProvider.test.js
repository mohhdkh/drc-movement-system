const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { getPostgresConfig, parseSsl } = require('../src/db/postgres/config')
const { withTransaction } = require('../src/db/postgres/pool')
const { PostgresOperationalProvider } = require('../src/db/providers/postgresOperationalProvider')
const { validateSnapshot } = require('../src/db/migration/sqliteSource')
const { compareCounts } = require('../src/tools/postgresVerify')

function createMockPool(handler = async () => ({ rows: [], rowCount: 0 })) {
  const queries = []
  const client = {
    async query(text, values) {
      const normalized = typeof text === 'string' ? text.trim() : text.text.trim()
      queries.push({ text: normalized, values })
      return handler(normalized, values, queries)
    },
    releaseCalled: false,
    release() { this.releaseCalled = true },
  }
  return {
    client,
    queries,
    async connect() { return client },
    async query(text, values) { return handler(text.trim(), values, queries) },
    on() {},
    async end() {},
  }
}

function movement(overrides = {}) {
  return {
    id: 'MOV-TEST0001', requesterId: 'emp-001', movementDate: '2026-09-10',
    purpose: 'Field visit', etd: '09:00', eta: '12:00', startLocation: 'Office',
    routePoints: ['Site A'], vehicleLeaderId: 'emp-001', notes: null,
    status: 'PENDING_SAFETY',
    segments: [{
      id: 'MOV-TEST0001-SEG-1', movementId: 'MOV-TEST0001', code: 'SEG-1',
      fromLocation: 'Office', toLocation: 'Site A', arrivalTime: '09:30',
      departureTime: '10:15', passengerIds: ['emp-001'],
    }],
    safetyReview: { reviewedBy: null, reviewedAt: null, decision: null, comment: null },
    gpsAssignment: { type: null, gpsDeviceId: null },
    supplyChainAssignment: { assignedBy: null, assignedAt: null, vehicleId: null, driverId: null, comment: null },
    areaManagerApproval: { decision: null, reviewedBy: null, reviewedAt: null, comment: null },
    createdAt: '2026-09-05T12:00:00.000Z', updatedAt: '2026-09-05T12:00:00.000Z',
    ...overrides,
  }
}

function emptyCache() {
  return {
    departments: [], drivers: [], gpsDevices: [], locations: [], vehicles: [], users: [],
    settings: {}, audits: [], movements: [], statusHistory: {},
  }
}

test('PostgreSQL config supports URL/discrete settings, pooling, timeouts, and explicit SSL', () => {
  const url = getPostgresConfig({ DATABASE_URL: 'postgresql://example/db', PGSSL: 'true' })
  assert.equal(url.connectionString, 'postgresql://example/db')
  assert.deepEqual(url.ssl, { rejectUnauthorized: true })
  assert.equal(url.max, 10)
  assert.equal(url.query_timeout, 10000)
  const discrete = getPostgresConfig({ PGHOST: 'localhost', PGDATABASE: 'drc', PGUSER: 'drc', PGPORT: '5433' })
  assert.equal(discrete.host, 'localhost')
  assert.equal(discrete.port, 5433)
  assert.deepEqual(parseSsl('no-verify'), { rejectUnauthorized: false })
  assert.throws(() => getPostgresConfig({ PGHOST: 'localhost' }), /PGDATABASE, PGUSER/)
})

test('PostgreSQL cache refresh loads data sequentially and coalesces callers', async () => {
  const provider = new PostgresOperationalProvider({ pool: createMockPool() })
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let started = 0
  let active = 0
  let maximumActive = 0
  const load = async (value) => {
    started += 1
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await gate
    active -= 1
    return value
  }
  provider.fetchResources = async () => load([])
  provider.fetchUsers = async () => load([])
  provider.fetchSettings = async () => load({})
  provider.fetchAuditLogs = async () => load([])
  provider.fetchMovements = async () => load([])
  provider.fetchStatusHistory = async () => load({})

  const first = provider.refreshCache()
  const second = provider.refreshCache()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(started, 1)
  assert.equal(maximumActive, 1)
  release()
  await Promise.all([first, second])
  assert.equal(started, 10)
  assert.equal(maximumActive, 1)
  assert.deepEqual(provider.cache, emptyCache())
})

test('PostgreSQL cache refresh uses one checked-out connection for the full snapshot', async () => {
  let connectCalls = 0
  let clientQueries = 0
  let released = false
  const client = {
    async query(sql) {
      clientQueries += 1
      if (sql.includes('FROM system_settings')) {
        return {
          rows: [{
            movement_timezone: 'Asia/Gaza',
            movement_cutoff_hour: 12,
            updated_at: '2026-09-05T12:00:00.000Z',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    },
    release() { released = true },
  }
  const pool = {
    async connect() {
      connectCalls += 1
      return client
    },
    async query() { throw new Error('Cache refresh must not fan out through the pool.') },
    on() {},
    async end() {},
  }
  const provider = new PostgresOperationalProvider({ pool })

  await provider.refreshCache()

  assert.equal(connectCalls, 1)
  assert.equal(clientQueries, 16)
  assert.equal(released, true)
  assert.deepEqual(provider.cache.movements, [])
})

test('PostgreSQL stale reads return cached data while one refresh runs in the background', async () => {
  const provider = new PostgresOperationalProvider({ pool: createMockPool(), cacheRefreshIntervalMs: 1 })
  provider.cache = emptyCache()
  provider.cacheUpdatedAt = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let started = 0
  const load = async (value) => {
    started += 1
    if (started === 1) await gate
    return value
  }
  provider.fetchResources = async () => load([])
  provider.fetchUsers = async () => load([])
  provider.fetchSettings = async () => load({})
  provider.fetchAuditLogs = async () => load([])
  provider.fetchMovements = async () => load([])
  provider.fetchStatusHistory = async () => load({})

  const first = await provider.refreshCache({ allowStale: true })
  const second = await provider.refreshCache({ allowStale: true })
  assert.equal(started, 1)
  assert.equal(first, provider.cache)
  assert.equal(second, provider.cache)

  release()
  await provider.waitForCacheRefresh()
  assert.equal(started, 10)
  assert.ok(provider.cacheUpdatedAt > 0)
})

test('withTransaction commits and releases the same checked-out client', async () => {
  const pool = createMockPool()
  const result = await withTransaction(pool, async (client) => {
    assert.equal(client, pool.client)
    await client.query('SELECT $1::text', ['ok'])
    return 'done'
  })
  assert.equal(result, 'done')
  assert.deepEqual(pool.queries.map((query) => query.text), ['BEGIN', 'SELECT $1::text', 'COMMIT'])
  assert.equal(pool.client.releaseCalled, true)
})

test('withTransaction rolls back and releases on a failed statement', async () => {
  const pool = createMockPool(async (sql) => {
    if (sql === 'BROKEN') throw new Error('statement failed')
    return { rows: [], rowCount: 0 }
  })
  await assert.rejects(() => withTransaction(pool, (client) => client.query('BROKEN')), /statement failed/)
  assert.deepEqual(pool.queries.map((query) => query.text), ['BEGIN', 'BROKEN', 'ROLLBACK'])
  assert.equal(pool.client.releaseCalled, true)
})

test('PostgreSQL movement creation writes aggregate, stop times, passengers, and history atomically', async () => {
  const pool = createMockPool(async (sql) => {
    if (sql.startsWith('SELECT status FROM movements')) return { rows: [], rowCount: 0 }
    if (sql.startsWith('SELECT id, movement_id')) return { rows: [], rowCount: 0 }
    return { rows: [], rowCount: 1 }
  })
  const provider = new PostgresOperationalProvider({ pool })
  provider.cache = emptyCache()
  await provider.writeMovement(movement(), { actorId: 'emp-001', context: 'submitted' })
  assert.equal(pool.queries[0].text, 'BEGIN')
  assert.equal(pool.queries.at(-1).text, 'COMMIT')
  const segmentInsert = pool.queries.find((query) => query.text.includes('INSERT INTO movement_segments'))
  assert.equal(segmentInsert.values[6], '09:30')
  assert.equal(segmentInsert.values[7], '10:15')
  assert.ok(pool.queries.some((query) => query.text.includes('INSERT INTO movement_segment_passengers')))
  assert.ok(pool.queries.some((query) => query.text.includes('INSERT INTO movement_status_history')))
})

test('PostgreSQL allows an audited same-status Employee edit atomically', async () => {
  const pool = createMockPool(async (sql) => {
    if (sql.startsWith('SELECT status FROM movements')) {
      return { rows: [{ status: 'PENDING_SAFETY' }], rowCount: 1 }
    }
    if (sql.includes('INSERT INTO audit_logs')) return { rows: [{ id: '9' }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  const provider = new PostgresOperationalProvider({ pool })
  provider.cache = { ...emptyCache(), movements: [movement()] }
  const edited = movement({ purpose: 'Corrected field visit', updatedAt: '2026-09-05T12:05:00.000Z' })
  const audit = {
    timestamp: edited.updatedAt,
    actorId: 'emp-001',
    actorName: 'Employee',
    action: 'MOVEMENT_UPDATED',
    entityType: 'MOVEMENT',
    entityId: edited.id,
    before: { purpose: 'Field visit' },
    after: { purpose: edited.purpose },
  }

  await provider.writeMovement(edited, { allowSameStatus: true, audit })

  assert.equal(provider.cache.movements[0].purpose, 'Corrected field visit')
  assert.equal(provider.listAuditLogs()[0].id, 'AUD-000009')
  assert.ok(!pool.queries.some((query) => query.text.includes('INSERT INTO movement_status_history')))
  const auditIndex = pool.queries.findIndex((query) => query.text.includes('INSERT INTO audit_logs'))
  assert.ok(auditIndex > 0 && auditIndex < pool.queries.findIndex((query) => query.text === 'COMMIT'))
})

test('PostgreSQL Safety conflict check uses advisory lock and exact overlap predicates', async () => {
  const reviewed = movement({
    status: 'SAFETY_APPROVED',
    safetyReview: { reviewedBy: 'emp-002', reviewedAt: '2026-09-05T12:01:00.000Z', decision: 'APPROVED', comment: null },
    gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-001' },
  })
  const pool = createMockPool(async (sql) => {
    if (sql.startsWith('SELECT status FROM movements')) return { rows: [{ status: 'PENDING_SAFETY' }], rowCount: 1 }
    if (sql.includes('JOIN safety_reviews')) return { rows: [{ id: 'MOV-CONFLICT', etd: '09:15', eta: '10:00' }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  const provider = new PostgresOperationalProvider({ pool })
  provider.cache = emptyCache()
  await assert.rejects(() => provider.writeMovement(reviewed), /GPS device is not available/)
  assert.ok(pool.queries.some((query) => query.text.includes('pg_advisory_xact_lock')))
  const conflict = pool.queries.find((query) => query.text.includes('JOIN safety_reviews'))
  assert.match(conflict.text, /m\.etd < \$4 AND m\.eta > \$3/)
  assert.match(conflict.text, /'SAFETY_APPROVED', 'VEHICLE_ASSIGNED', 'PENDING_AREA_MANAGER', 'FINAL_APPROVED'/)
  assert.equal(pool.queries.at(-1).text, 'ROLLBACK')
})

test('PostgreSQL rejects a duplicate workflow decision under row lock', async () => {
  const reviewed = movement({ status: 'SAFETY_APPROVED' })
  const pool = createMockPool(async (sql) => {
    if (sql.startsWith('SELECT status FROM movements')) return { rows: [{ status: 'SAFETY_APPROVED' }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  const provider = new PostgresOperationalProvider({ pool })
  provider.cache = emptyCache()
  await assert.rejects(() => provider.writeMovement(reviewed), /already been completed/)
  assert.ok(pool.queries.some((query) => query.text.endsWith('FOR UPDATE')))
  assert.ok(!pool.queries.some((query) => query.text.includes('INSERT INTO movements')))
})

test('PostgreSQL serializes vehicle and driver allocation before conflict checks', async () => {
  const assigned = movement({
    status: 'VEHICLE_ASSIGNED',
    supplyChainAssignment: {
      assignedBy: 'emp-006', assignedAt: '2026-09-05T12:02:00.000Z',
      vehicleId: 'veh-001', driverId: 'drv-001', comment: null,
    },
  })
  const pool = createMockPool(async (sql) => {
    if (sql.startsWith('SELECT status FROM movements')) return { rows: [{ status: 'SAFETY_APPROVED' }], rowCount: 1 }
    if (sql.includes('s.vehicle_id')) return { rows: [], rowCount: 0 }
    if (sql.includes('s.driver_id')) return { rows: [{ id: 'MOV-DRIVER-CONFLICT' }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  const provider = new PostgresOperationalProvider({ pool })
  provider.cache = emptyCache()
  await assert.rejects(() => provider.writeMovement(assigned), /driver is not available/)
  const lockValues = pool.queries
    .filter((query) => query.text.includes('pg_advisory_xact_lock'))
    .map((query) => query.values[0])
  assert.deepEqual(lockValues, ['movement:MOV-TEST0001', 'driver:drv-001', 'vehicle:veh-001'])
})

test('PostgreSQL persists an Admin user mutation and audit in one transaction', async () => {
  const pool = createMockPool(async (sql) => {
    if (sql.includes('INSERT INTO audit_logs')) return { rows: [{ id: '7' }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  const provider = new PostgresOperationalProvider({ pool })
  provider.cache = emptyCache()
  const user = {
    id: 'emp-100', name: 'Admin Test', email: 'admin.test@example.org', phone: null,
    departmentId: null, roles: ['EMPLOYEE'], active: true,
    createdAt: '2026-09-05T12:00:00.000Z', updatedAt: '2026-09-05T12:00:00.000Z',
  }
  await provider.replaceUsers([user], {
    timestamp: '2026-09-05T12:00:00.000Z', actorId: 'emp-002', actorName: 'Demo Safety Officer',
    action: 'USER_CREATED', entityType: 'USER', entityId: user.id, before: null, after: user,
  })
  const auditIndex = pool.queries.findIndex((query) => query.text.includes('INSERT INTO audit_logs'))
  const commitIndex = pool.queries.findIndex((query) => query.text === 'COMMIT')
  assert.ok(auditIndex > 0 && auditIndex < commitIndex)
  assert.equal(provider.listAuditLogs()[0].id, 'AUD-000007')
})

test('PostgreSQL schema contains every operational table and native data types', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../src/db/postgres/migrations/001_initial_schema.sql'), 'utf8')
  for (const table of ['users', 'user_roles', 'departments', 'vehicles', 'drivers', 'gps_devices', 'locations',
    'system_settings', 'audit_logs', 'movements', 'movement_segments', 'movement_segment_passengers',
    'safety_reviews', 'supply_chain_assignments', 'area_manager_approvals', 'movement_status_history']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
  }
  assert.match(sql, /movement_date DATE NOT NULL/)
  assert.match(sql, /arrival_time TIME NOT NULL/)
  assert.match(sql, /before_json JSONB/)
  assert.match(sql, /created_at TIMESTAMPTZ/)
})

test('Entra identity migration adds nullable columns and a partial unique tenant/object index', () => {
  const sqlite = fs.readFileSync(path.resolve(__dirname, '../src/db/migrations/003_entra_identity.sql'), 'utf8')
  const postgres = fs.readFileSync(path.resolve(__dirname, '../src/db/postgres/migrations/003_entra_identity.sql'), 'utf8')
  for (const sql of [sqlite, postgres]) {
    assert.match(sql, /entra_object_id TEXT/)
    assert.match(sql, /entra_tenant_id TEXT/)
    assert.match(sql, /entra_principal_name TEXT/)
    assert.match(sql, /UNIQUE INDEX[\s\S]*entra_tenant_id, entra_object_id/)
  }
})

test('SQLite import validation detects duplicate stable IDs before PostgreSQL writes', () => {
  const duplicate = { id: 'emp-001', email: 'one@example.org' }
  const conflicts = validateSnapshot({
    users: [duplicate, { ...duplicate, email: 'two@example.org' }], departments: [], vehicles: [],
    drivers: [], gpsDevices: [], locations: [], movements: [],
  })
  assert.deepEqual(conflicts, ['users: duplicate id emp-001'])
})

test('PostgreSQL verification accepts additional live records but detects missing imports', () => {
  assert.deepEqual(compareCounts({ movements: 2, segments: 4 }, { movements: 3, segments: 4 }), {
    missing: [], extra: { movements: 1 },
  })
  assert.deepEqual(compareCounts({ movements: 2, segments: 4 }, { movements: 1, segments: 3 }), {
    missing: ['movements', 'segments'], extra: {},
  })
})
