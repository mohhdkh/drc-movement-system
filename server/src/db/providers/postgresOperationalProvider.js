const { AppError } = require('../../utils/AppError')
const { logger } = require('../../services/logger')
const { getMigrationStatus } = require('../postgres/migrationRunner')
const {
  createPostgresPool,
  retryTransientPostgresOperation,
  validatePostgresConnection,
  withTransaction,
} = require('../postgres/pool')

const DEFAULT_CACHE_REFRESH_INTERVAL_MS = 5000

const resourceDefinitions = {
  departments: { table: 'departments', fields: [['name', 'name']] },
  drivers: { table: 'drivers', fields: [['name', 'name'], ['phone', 'phone']] },
  gpsDevices: { table: 'gps_devices', fields: [['code', 'code'], ['label', 'label']] },
  locations: {
    table: 'locations',
    fields: [['name', 'name'], ['latitude', 'latitude'], ['longitude', 'longitude']],
  },
  vehicles: {
    table: 'vehicles',
    fields: [['code', 'code'], ['plateNumber', 'plate_number'], ['model', 'model'], ['capacity', 'capacity']],
  },
}

function iso(value) {
  if (value == null || typeof value === 'string') return value
  return value.toISOString()
}

function time(value) {
  if (value == null) return value
  return String(value).slice(0, 5)
}

function date(value) {
  if (value == null) return value
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

function resourceFromRow(row, definition) {
  const item = {
    id: row.id,
    active: Boolean(row.active),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
  for (const [property, column] of definition.fields) item[property] = row[column]
  return item
}

function auditFromRow(row) {
  return {
    id: `AUD-${String(row.id).padStart(6, '0')}`,
    timestamp: iso(row.timestamp),
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before_json ?? null,
    after: row.after_json ?? null,
  }
}

async function insertAudit(client, entry) {
  const result = await client.query(`
    INSERT INTO audit_logs (
      timestamp, actor_id, actor_name, action, entity_type, entity_id, before_json, after_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) RETURNING id
  `, [
    entry.timestamp,
    entry.actorId,
    entry.actorName,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.before == null ? null : JSON.stringify(entry.before),
    entry.after == null ? null : JSON.stringify(entry.after),
  ])
  return { id: `AUD-${String(result.rows[0].id).padStart(6, '0')}`, ...entry }
}

class PostgresOperationalProvider {
  constructor(options = {}) {
    this.name = 'postgres'
    this.pool = options.pool || createPostgresPool(options)
    this.cache = null
    this.refreshPromise = null
    this.backgroundRefreshObserver = null
    this.cacheUpdatedAt = 0
    this.cacheRefreshIntervalMs = options.cacheRefreshIntervalMs ?? DEFAULT_CACHE_REFRESH_INTERVAL_MS
  }

  async initialize() {
    await validatePostgresConnection(this.pool)
    const migrationStatus = await retryTransientPostgresOperation(
      () => getMigrationStatus(this.pool),
      { operation: 'PostgreSQL migration status validation' },
    )
    if (!migrationStatus.upToDate) {
      throw new Error(
        `PostgreSQL migrations are pending: ${migrationStatus.pending.join(', ')}. ` +
        'Run npm run db:postgres:migrate before starting the API.',
      )
    }
    await this.refreshCache()
  }

  isCacheFresh() {
    return this.cache && Date.now() - this.cacheUpdatedAt < this.cacheRefreshIntervalMs
  }

  startCacheRefresh() {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = (async () => {
      try {
        const cache = await retryTransientPostgresOperation(
          () => this.loadFreshCache(),
          { operation: 'PostgreSQL cache refresh' },
        )
        this.cacheUpdatedAt = Date.now()
        return cache
      } finally {
        this.refreshPromise = null
      }
    })()
    return this.refreshPromise
  }

  observeBackgroundRefresh(promise) {
    if (this.backgroundRefreshObserver?.promise === promise) return
    const observer = promise.catch((error) => {
      logger.warn('postgres_cache_background_refresh_failed', {
        errorName: error?.name,
        errorCode: error?.code,
      })
    }).finally(() => {
      if (this.backgroundRefreshObserver?.promise === promise) this.backgroundRefreshObserver = null
    })
    this.backgroundRefreshObserver = { promise, observer }
  }

  refreshCache({ allowStale = false, force = false } = {}) {
    if (!force && this.isCacheFresh()) return Promise.resolve(this.cache)
    const refresh = this.startCacheRefresh()
    if (allowStale && this.cache) {
      this.observeBackgroundRefresh(refresh)
      return Promise.resolve(this.cache)
    }
    return refresh
  }

  async waitForCacheRefresh() {
    if (this.refreshPromise) await this.refreshPromise
    return this.requireCache()
  }

  async loadFreshCache() {
    const client = await this.pool.connect()
    try {
      const departments = await this.fetchResources('departments', client)
      const drivers = await this.fetchResources('drivers', client)
      const gpsDevices = await this.fetchResources('gpsDevices', client)
      const locations = await this.fetchResources('locations', client)
      const vehicles = await this.fetchResources('vehicles', client)
      const users = await this.fetchUsers(client)
      const settings = await this.fetchSettings(client)
      const audits = await this.fetchAuditLogs(client)
      const movements = await this.fetchMovements(client)
      const statusHistory = await this.fetchStatusHistory(client)
      this.cache = {
        departments,
        drivers,
        gpsDevices,
        locations,
        vehicles,
        users,
        settings,
        audits,
        movements,
        statusHistory,
      }
      return this.cache
    } finally {
      client.release()
    }
  }

  requireCache() {
    if (!this.cache) throw new Error('PostgreSQL operational provider has not been initialized.')
    return this.cache
  }

  async fetchResources(name, queryable = this.pool) {
    const definition = resourceDefinitions[name]
    const result = await queryable.query(`SELECT * FROM ${definition.table} ORDER BY created_at, id`)
    return result.rows.map((row) => resourceFromRow(row, definition))
  }

  loadResources(name) { return this.requireCache()[name].map((item) => ({ ...item })) }

  async replaceResources(name, items, audit) {
    let savedAudit
    const definition = resourceDefinitions[name]
    await withTransaction(this.pool, async (client) => {
      for (const item of items) {
        const columns = ['id', ...definition.fields.map(([, column]) => column), 'active', 'created_at', 'updated_at']
        const values = [item.id, ...definition.fields.map(([property]) => item[property]), item.active, item.createdAt, item.updatedAt]
        const updates = columns.slice(1).map((column, index) => `${column} = $${index + 2}`)
        await client.query(`
          INSERT INTO ${definition.table} (${columns.join(', ')})
          VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
          ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}
        `, values)
      }
      if (audit) savedAudit = await insertAudit(client, audit)
    })
    this.cache[name] = items.map((item) => ({ ...item }))
    if (savedAudit) this.cache.audits.unshift(savedAudit)
  }

  async fetchUsers(queryable = this.pool) {
    const userResult = await queryable.query('SELECT * FROM users ORDER BY created_at, id')
    const roleResult = await queryable.query('SELECT user_id, role FROM user_roles ORDER BY user_id, role')
    const roles = new Map()
    for (const row of roleResult.rows) roles.set(row.user_id, [...(roles.get(row.user_id) || []), row.role])
    return userResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      departmentId: row.department_id,
      entraObjectId: row.entra_object_id,
      entraTenantId: row.entra_tenant_id,
      entraPrincipalName: row.entra_principal_name,
      roles: roles.get(row.id) || [],
      active: Boolean(row.active),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }))
  }

  loadUsers() { return this.requireCache().users.map((item) => ({ ...item, roles: [...item.roles] })) }

  async replaceUsers(items, audit) {
    let savedAudit
    await withTransaction(this.pool, async (client) => {
      for (const item of items) {
        await client.query(`
          INSERT INTO users (
            id, name, email, phone, department_id, entra_object_id, entra_tenant_id,
            entra_principal_name, active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET name=$2, email=$3, phone=$4, department_id=$5,
            entra_object_id=$6, entra_tenant_id=$7, entra_principal_name=$8,
            active=$9, created_at=$10, updated_at=$11
        `, [item.id, item.name, item.email, item.phone, item.departmentId,
          item.entraObjectId, item.entraTenantId, item.entraPrincipalName,
          item.active, item.createdAt, item.updatedAt])
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [item.id])
        for (const role of item.roles) {
          await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [item.id, role])
        }
      }
      if (audit) savedAudit = await insertAudit(client, audit)
    })
    this.cache.users = items.map((item) => ({ ...item, roles: [...item.roles] }))
    if (savedAudit) this.cache.audits.unshift(savedAudit)
  }

  async linkUserEntraIdentity(userId, identity, audit) {
    let linked
    let savedAudit
    try {
      await withTransaction(this.pool, async (client) => {
        const result = await client.query(`
          UPDATE users SET entra_object_id=$2, entra_tenant_id=$3, entra_principal_name=$4, updated_at=$5
          WHERE id=$1 AND entra_object_id IS NULL AND entra_tenant_id IS NULL
          RETURNING *
        `, [userId, identity.objectId, identity.tenantId, identity.principalName, identity.updatedAt])
        if (!result.rowCount) {
          throw new AppError('The local account already has a Microsoft identity.', 409, undefined, 'ACCOUNT_LINK_CONFLICT')
        }
        linked = result.rows[0]
        if (audit) savedAudit = await insertAudit(client, audit)
      })
    } catch (error) {
      if (error?.code === '23505') {
        throw new AppError('Microsoft account is already linked.', 409, undefined, 'ACCOUNT_LINK_CONFLICT')
      }
      throw error
    }
    const index = this.cache.users.findIndex((user) => user.id === userId)
    const updated = {
      ...this.cache.users[index],
      entraObjectId: linked.entra_object_id,
      entraTenantId: linked.entra_tenant_id,
      entraPrincipalName: linked.entra_principal_name,
      updatedAt: iso(linked.updated_at),
    }
    this.cache.users[index] = updated
    if (savedAudit) this.cache.audits.unshift(savedAudit)
    return { ...updated, roles: [...updated.roles] }
  }

  async fetchSettings(queryable = this.pool) {
    const result = await queryable.query("SELECT * FROM system_settings WHERE id = 'system'")
    if (!result.rowCount) throw new Error('PostgreSQL system settings are missing. Import or seed the database.')
    const row = result.rows[0]
    return {
      movementTimezone: row.movement_timezone,
      movementCutoffHour: row.movement_cutoff_hour,
      updatedAt: iso(row.updated_at),
    }
  }

  getSettings() {
    const { movementTimezone, movementCutoffHour } = this.requireCache().settings
    return { movementTimezone, movementCutoffHour }
  }
  getSettingsRecord() { return { ...this.requireCache().settings } }

  async saveSettings(settings, audit) {
    let savedAudit
    const updatedAt = settings.updatedAt || new Date().toISOString()
    await withTransaction(this.pool, async (client) => {
      await client.query(`
        INSERT INTO system_settings (id, movement_timezone, movement_cutoff_hour, updated_at)
        VALUES ('system', $1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET movement_timezone=$1, movement_cutoff_hour=$2, updated_at=$3
      `, [settings.movementTimezone, settings.movementCutoffHour, updatedAt])
      if (audit) savedAudit = await insertAudit(client, audit)
    })
    this.cache.settings = { ...settings, updatedAt }
    if (savedAudit) this.cache.audits.unshift(savedAudit)
  }

  async fetchAuditLogs(queryable = this.pool) {
    const result = await queryable.query('SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC')
    return result.rows.map(auditFromRow)
  }
  listAuditLogs() { return this.requireCache().audits.map((entry) => ({ ...entry })) }
  async insertAuditLog(entry) {
    const saved = await withTransaction(this.pool, (client) => insertAudit(client, entry))
    this.cache.audits.unshift(saved)
    return saved
  }
  async resetAuditLogs() {
    await this.pool.query('TRUNCATE audit_logs RESTART IDENTITY')
    this.cache.audits = []
  }

  async fetchMovements(queryable = this.pool) {
    const movementResult = await queryable.query('SELECT * FROM movements ORDER BY created_at DESC')
    const segmentResult = await queryable.query('SELECT * FROM movement_segments ORDER BY movement_id, sequence_number')
    const passengerResult = await queryable.query('SELECT * FROM movement_segment_passengers ORDER BY segment_id, position')
    const safetyResult = await queryable.query('SELECT * FROM safety_reviews')
    const supplyResult = await queryable.query('SELECT * FROM supply_chain_assignments')
    const areaResult = await queryable.query('SELECT * FROM area_manager_approvals')
    const byMovement = (rows) => new Map(rows.map((row) => [row.movement_id, row]))
    const safety = byMovement(safetyResult.rows)
    const supply = byMovement(supplyResult.rows)
    const area = byMovement(areaResult.rows)
    const passengers = new Map()
    for (const row of passengerResult.rows) {
      passengers.set(row.segment_id, [...(passengers.get(row.segment_id) || []), row.user_id])
    }
    const segments = new Map()
    for (const row of segmentResult.rows) {
      const segment = {
        id: row.id,
        movementId: row.movement_id,
        sequence: Number(row.sequence_number) + 1,
        code: row.code,
        fromLocation: row.from_location,
        toLocation: row.to_location,
        fromLocationId: row.from_location_id ?? null,
        toLocationId: row.to_location_id ?? null,
        fromLatitude: row.from_latitude ?? null,
        fromLongitude: row.from_longitude ?? null,
        toLatitude: row.to_latitude ?? null,
        toLongitude: row.to_longitude ?? null,
        arrivalTime: time(row.arrival_time),
        departureTime: time(row.departure_time),
        passengerIds: passengers.get(row.id) || [],
      }
      segments.set(row.movement_id, [...(segments.get(row.movement_id) || []), segment])
    }
    return movementResult.rows.map((row) => {
      const safetyRow = safety.get(row.id)
      const supplyRow = supply.get(row.id)
      const areaRow = area.get(row.id)
      return {
        id: row.id,
        requesterId: row.requester_id,
        movementDate: date(row.movement_date),
        purpose: row.purpose,
        etd: time(row.etd),
        eta: time(row.eta),
        startLocation: row.start_location,
        startLocationId: row.start_location_id ?? null,
        routePoints: row.route_points,
        routePointLocationIds: row.route_point_location_ids || [],
        segments: segments.get(row.id) || [],
        vehicleLeaderId: row.vehicle_leader_id,
        notes: row.notes,
        status: row.status,
        safetyReview: {
          reviewedBy: safetyRow?.reviewed_by ?? null,
          reviewedAt: iso(safetyRow?.reviewed_at ?? null),
          decision: safetyRow?.decision ?? null,
          comment: safetyRow?.comment ?? null,
        },
        gpsAssignment: {
          type: safetyRow?.gps_type ?? null,
          gpsDeviceId: safetyRow?.gps_device_id ?? null,
        },
        supplyChainAssignment: {
          assignedBy: supplyRow?.assigned_by ?? null,
          assignedAt: iso(supplyRow?.assigned_at ?? null),
          vehicleId: supplyRow?.vehicle_id ?? null,
          driverId: supplyRow?.driver_id ?? null,
          comment: supplyRow?.comment ?? null,
        },
        areaManagerApproval: {
          decision: areaRow?.decision ?? null,
          reviewedBy: areaRow?.reviewed_by ?? null,
          reviewedAt: iso(areaRow?.reviewed_at ?? null),
          comment: areaRow?.comment ?? null,
        },
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      }
    })
  }

  loadMovements() { return this.requireCache().movements.map((item) => ({ ...item })) }

  async fetchStatusHistory(queryable = this.pool) {
    const result = await queryable.query(`
      SELECT id, movement_id, status, changed_at, from_status, actor_id, context
      FROM movement_status_history ORDER BY movement_id, id
    `)
    const history = {}
    for (const row of result.rows) {
      const entry = {
        id: Number(row.id), status: row.status, changedAt: iso(row.changed_at),
        fromStatus: row.from_status, actorId: row.actor_id, context: row.context,
      }
      history[row.movement_id] = [...(history[row.movement_id] || []), entry]
    }
    return history
  }

  async lockAndCheckConflicts(client, movement) {
    const locks = []
    if (movement.gpsAssignment?.type === 'DEVICE') locks.push(`gps:${movement.gpsAssignment.gpsDeviceId}`)
    if (movement.supplyChainAssignment?.vehicleId) locks.push(`vehicle:${movement.supplyChainAssignment.vehicleId}`)
    if (movement.supplyChainAssignment?.driverId) locks.push(`driver:${movement.supplyChainAssignment.driverId}`)
    for (const lock of locks.sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock])
    }

    const base = [movement.id, movement.movementDate, movement.etd, movement.eta]
    if (
      ['SAFETY_APPROVED', 'VEHICLE_ASSIGNED', 'PENDING_AREA_MANAGER', 'FINAL_APPROVED'].includes(movement.status) &&
      movement.gpsAssignment?.type === 'DEVICE'
    ) {
      const conflict = await client.query(`
        SELECT m.id, m.etd, m.eta FROM movements m
        JOIN safety_reviews s ON s.movement_id = m.id
        WHERE m.id <> $1 AND m.movement_date = $2 AND m.etd < $4 AND m.eta > $3
          AND m.status IN ('SAFETY_APPROVED', 'VEHICLE_ASSIGNED', 'PENDING_AREA_MANAGER', 'FINAL_APPROVED')
          AND s.gps_type = 'DEVICE' AND s.gps_device_id = $5
        LIMIT 1
      `, [...base, movement.gpsAssignment.gpsDeviceId])
      if (conflict.rowCount) throw new AppError('The selected GPS device is not available for this movement time.', 409)
    }
    if (movement.status === 'VEHICLE_ASSIGNED') {
      for (const [field, column, value, label] of [
        ['vehicleId', 'vehicle_id', movement.supplyChainAssignment.vehicleId, 'vehicle'],
        ['driverId', 'driver_id', movement.supplyChainAssignment.driverId, 'driver'],
      ]) {
        const conflict = await client.query(`
          SELECT m.id, m.etd, m.eta FROM movements m
          JOIN supply_chain_assignments s ON s.movement_id = m.id
          WHERE m.id <> $1 AND m.movement_date = $2 AND m.etd < $4 AND m.eta > $3
            AND m.status IN ('VEHICLE_ASSIGNED', 'PENDING_AREA_MANAGER', 'FINAL_APPROVED')
            AND s.${column} = $5 LIMIT 1
        `, [...base, value])
        if (conflict.rowCount) {
          throw new AppError(`The selected ${label} is not available for this movement time.`, 409, [
            { field, message: `${conflict.rows[0].id} already uses this ${label}.` },
          ])
        }
      }
    }
  }

  expectedPreviousStatus(status) {
    if (status === 'PENDING_SAFETY') return null
    if (['SAFETY_APPROVED', 'SAFETY_REJECTED', 'RETURNED_FOR_MODIFICATION'].includes(status)) return 'PENDING_SAFETY'
    if (status === 'VEHICLE_ASSIGNED') return 'SAFETY_APPROVED'
    if (['FINAL_APPROVED', 'FINAL_REJECTED'].includes(status)) return 'VEHICLE_ASSIGNED'
    return undefined
  }

  async writeMovement(movement, transition = {}) {
    let previousStatus = null
    let savedAudit
    await withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`movement:${movement.id}`])
      const existingResult = await client.query('SELECT status FROM movements WHERE id = $1 FOR UPDATE', [movement.id])
      const existingStatus = existingResult.rows[0]?.status ?? null
      previousStatus = existingStatus
      const expectedStatus = this.expectedPreviousStatus(movement.status)
      const isAllowedSameStatusUpdate = transition.allowSameStatus === true && existingStatus === movement.status
      const isAllowedExplicitTransition = Array.isArray(transition.allowedFromStatuses) &&
        transition.allowedFromStatuses.includes(existingStatus)
      if (!isAllowedSameStatusUpdate && !isAllowedExplicitTransition && expectedStatus !== undefined && existingStatus !== expectedStatus) {
        throw new AppError(
          existingStatus === null ? 'A duplicate movement write was rejected.' : 'This workflow decision has already been completed.',
          409,
        )
      }
      await this.lockAndCheckConflicts(client, movement)
      await client.query(`
        INSERT INTO movements (
          id, requester_id, movement_date, purpose, etd, eta, start_location, start_location_id, route_points, route_point_location_ids,
          vehicle_leader_id, notes, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO UPDATE SET requester_id=$2, movement_date=$3, purpose=$4, etd=$5,
          eta=$6, start_location=$7, start_location_id=$8, route_points=$9::jsonb,
          route_point_location_ids=$10::jsonb, vehicle_leader_id=$11, notes=$12,
          status=$13, updated_at=$15
      `, [
        movement.id, movement.requesterId, movement.movementDate, movement.purpose,
        movement.etd, movement.eta, movement.startLocation, movement.startLocationId,
        JSON.stringify(movement.routePoints), JSON.stringify(movement.routePointLocationIds || []),
        movement.vehicleLeaderId, movement.notes, movement.status, movement.createdAt, movement.updatedAt,
      ])
      await client.query('DELETE FROM movement_segments WHERE movement_id = $1', [movement.id])
      for (let index = 0; index < movement.segments.length; index += 1) {
        const segment = movement.segments[index]
        await client.query(`
          INSERT INTO movement_segments (
            id, movement_id, sequence_number, code, from_location, to_location, arrival_time, departure_time,
            from_location_id, to_location_id, from_latitude, from_longitude, to_latitude, to_longitude
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `, [segment.id, movement.id, index, segment.code, segment.fromLocation, segment.toLocation,
          segment.arrivalTime, segment.departureTime, segment.fromLocationId, segment.toLocationId,
          segment.fromLatitude, segment.fromLongitude, segment.toLatitude, segment.toLongitude])
        for (let position = 0; position < segment.passengerIds.length; position += 1) {
          await client.query(`
            INSERT INTO movement_segment_passengers (segment_id, user_id, position) VALUES ($1,$2,$3)
          `, [segment.id, segment.passengerIds[position], position])
        }
      }
      await client.query(`
        INSERT INTO safety_reviews (movement_id, reviewed_by, reviewed_at, decision, comment, gps_type, gps_device_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (movement_id) DO UPDATE SET
          reviewed_by=$2, reviewed_at=$3, decision=$4, comment=$5, gps_type=$6, gps_device_id=$7
      `, [movement.id, movement.safetyReview?.reviewedBy, movement.safetyReview?.reviewedAt,
        movement.safetyReview?.decision, movement.safetyReview?.comment,
        movement.gpsAssignment?.type, movement.gpsAssignment?.gpsDeviceId])
      await client.query(`
        INSERT INTO supply_chain_assignments (movement_id, assigned_by, assigned_at, vehicle_id, driver_id, comment)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (movement_id) DO UPDATE SET
          assigned_by=$2, assigned_at=$3, vehicle_id=$4, driver_id=$5, comment=$6
      `, [movement.id, movement.supplyChainAssignment?.assignedBy, movement.supplyChainAssignment?.assignedAt,
        movement.supplyChainAssignment?.vehicleId, movement.supplyChainAssignment?.driverId,
        movement.supplyChainAssignment?.comment])
      await client.query(`
        INSERT INTO area_manager_approvals (movement_id, decision, reviewed_by, reviewed_at, comment)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (movement_id) DO UPDATE SET
          decision=$2, reviewed_by=$3, reviewed_at=$4, comment=$5
      `, [movement.id, movement.areaManagerApproval?.decision, movement.areaManagerApproval?.reviewedBy,
        movement.areaManagerApproval?.reviewedAt, movement.areaManagerApproval?.comment])
      if (existingStatus !== movement.status) {
        await client.query(`
          INSERT INTO movement_status_history (movement_id, status, changed_at, from_status, actor_id, context)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [movement.id, movement.status, movement.updatedAt, existingStatus, transition.actorId, transition.context])
      }
      if (transition.audit) savedAudit = await insertAudit(client, transition.audit)
    })
    const index = this.cache.movements.findIndex((item) => item.id === movement.id)
    if (index === -1) this.cache.movements.unshift(movement)
    else this.cache.movements[index] = movement
    if (previousStatus !== movement.status) {
      const history = await this.fetchStatusHistory()
      this.cache.statusHistory = history
    }
    if (savedAudit) this.cache.audits.unshift(savedAudit)
    return movement
  }

  async resetStoredMovements() {
    await this.pool.query('TRUNCATE movements RESTART IDENTITY CASCADE')
    this.cache.movements = []
    this.cache.statusHistory = {}
  }

  listMovementStatusHistory(movementId) {
    return (this.requireCache().statusHistory[movementId] || []).map((entry) => ({ ...entry }))
  }

  async status() {
    try {
      const connection = await validatePostgresConnection(this.pool)
      const migrations = await getMigrationStatus(this.pool)
      return {
        provider: this.name,
        connected: true,
        migrationStatus: migrations.upToDate ? 'up-to-date' : 'pending',
        serverTime: iso(connection.serverTime),
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount,
        },
        message: 'PostgreSQL operational database connected',
      }
    } catch {
      return {
        provider: this.name,
        connected: false,
        migrationStatus: 'unknown',
        serverTime: null,
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount,
        },
        message: 'PostgreSQL operational database unavailable',
      }
    }
  }

  async close() { await this.pool.end() }
}

module.exports = { PostgresOperationalProvider, auditFromRow, resourceFromRow }
