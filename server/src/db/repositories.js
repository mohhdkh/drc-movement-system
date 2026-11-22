const { database, transaction } = require('./database')

const resourceDefinitions = {
  departments: {
    table: 'departments',
    fields: [{ property: 'name', column: 'name' }],
  },
  drivers: {
    table: 'drivers',
    fields: [
      { property: 'name', column: 'name' },
      { property: 'phone', column: 'phone' },
    ],
  },
  gpsDevices: {
    table: 'gps_devices',
    fields: [
      { property: 'code', column: 'code' },
      { property: 'label', column: 'label' },
    ],
  },
  locations: {
    table: 'locations',
    fields: [
      { property: 'name', column: 'name' },
      { property: 'latitude', column: 'latitude' },
      { property: 'longitude', column: 'longitude' },
    ],
  },
  vehicles: {
    table: 'vehicles',
    fields: [
      { property: 'code', column: 'code' },
      { property: 'plateNumber', column: 'plate_number' },
      { property: 'model', column: 'model' },
    ],
  },
}

function toCamelRow(row, definition) {
  const item = {
    id: row.id,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  for (const field of definition.fields) item[field.property] = row[field.column]
  return item
}

function loadResources(resourceName) {
  const definition = resourceDefinitions[resourceName]
  return database.prepare(`SELECT * FROM ${definition.table} ORDER BY rowid`).all()
    .map((row) => toCamelRow(row, definition))
}

function replaceResources(resourceName, items) {
  const definition = resourceDefinitions[resourceName]
  transaction(() => {
    database.exec(`DELETE FROM ${definition.table}`)
    const columns = ['id', ...definition.fields.map((field) => field.column), 'active', 'created_at', 'updated_at']
    const statement = database.prepare(
      `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    for (const item of items) {
      statement.run(
        item.id,
        ...definition.fields.map((field) => item[field.property]),
        Number(item.active),
        item.createdAt,
        item.updatedAt,
      )
    }
  })
}

function loadUsers() {
  const roles = database.prepare('SELECT user_id, role FROM user_roles ORDER BY rowid').all()
  const rolesByUser = new Map()
  for (const row of roles) {
    const values = rolesByUser.get(row.user_id) || []
    values.push(row.role)
    rolesByUser.set(row.user_id, values)
  }
  return database.prepare('SELECT * FROM users ORDER BY rowid').all().map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    departmentId: row.department_id,
    entraObjectId: row.entra_object_id,
    entraTenantId: row.entra_tenant_id,
    entraPrincipalName: row.entra_principal_name,
    roles: rolesByUser.get(row.id) || [],
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function replaceUsers(items) {
  transaction(() => {
    database.exec('DELETE FROM user_roles; DELETE FROM users;')
    const userStatement = database.prepare(`
      INSERT INTO users (
        id, name, email, phone, department_id, entra_object_id, entra_tenant_id,
        entra_principal_name, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const roleStatement = database.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
    for (const item of items) {
      userStatement.run(
        item.id,
        item.name,
        item.email,
        item.phone,
        item.departmentId,
        item.entraObjectId ?? null,
        item.entraTenantId ?? null,
        item.entraPrincipalName ?? null,
        Number(item.active),
        item.createdAt,
        item.updatedAt,
      )
      for (const role of item.roles) roleStatement.run(item.id, role)
    }
  })
}

function linkUserEntraIdentity(userId, identity, audit) {
  return transaction(() => {
    const current = database.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!current) throw Object.assign(new Error('Local user not found.'), { code: 'ACCOUNT_NOT_LINKED' })
    if (current.entra_object_id || current.entra_tenant_id) {
      throw Object.assign(new Error('Local user already has a Microsoft identity.'), { code: 'ACCOUNT_LINK_CONFLICT' })
    }
    database.prepare(`
      UPDATE users
      SET entra_object_id = ?, entra_tenant_id = ?, entra_principal_name = ?, updated_at = ?
      WHERE id = ? AND entra_object_id IS NULL AND entra_tenant_id IS NULL
    `).run(identity.objectId, identity.tenantId, identity.principalName, identity.updatedAt, userId)
    if (audit) insertAuditLog(audit)
    return loadUsers().find((user) => user.id === userId)
  })
}

function getSettings() {
  const row = database.prepare("SELECT * FROM system_settings WHERE id = 'system'").get()
  return {
    movementTimezone: row.movement_timezone,
    movementCutoffHour: row.movement_cutoff_hour,
  }
}

function getSettingsRecord() {
  const row = database.prepare("SELECT * FROM system_settings WHERE id = 'system'").get()
  return {
    movementTimezone: row.movement_timezone,
    movementCutoffHour: row.movement_cutoff_hour,
    updatedAt: row.updated_at,
  }
}

function saveSettings(settings) {
  database.prepare(`
    UPDATE system_settings
    SET movement_timezone = ?, movement_cutoff_hour = ?, updated_at = ?
    WHERE id = 'system'
  `).run(settings.movementTimezone, settings.movementCutoffHour, new Date().toISOString())
}

function listAuditLogs() {
  return database.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC').all().map((row) => ({
    id: `AUD-${String(row.id).padStart(6, '0')}`,
    timestamp: row.timestamp,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
  }))
}

function insertAuditLog(entry) {
  const result = database.prepare(`
    INSERT INTO audit_logs (
      timestamp, actor_id, actor_name, action, entity_type, entity_id, before_json, after_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.timestamp,
    entry.actorId,
    entry.actorName,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.before == null ? null : JSON.stringify(entry.before),
    entry.after == null ? null : JSON.stringify(entry.after),
  )
  return { id: `AUD-${String(result.lastInsertRowid).padStart(6, '0')}`, ...entry }
}

function resetAuditLogs() {
  transaction(() => {
    database.exec("DELETE FROM audit_logs; DELETE FROM sqlite_sequence WHERE name = 'audit_logs';")
  })
}

function loadMovements() {
  const movements = database.prepare('SELECT * FROM movements ORDER BY created_at DESC').all()
  const segmentStatement = database.prepare(
    'SELECT * FROM movement_segments WHERE movement_id = ? ORDER BY sequence_number',
  )
  const passengerStatement = database.prepare(
    'SELECT user_id FROM movement_segment_passengers WHERE segment_id = ? ORDER BY position',
  )
  const safetyStatement = database.prepare('SELECT * FROM safety_reviews WHERE movement_id = ?')
  const supplyStatement = database.prepare('SELECT * FROM supply_chain_assignments WHERE movement_id = ?')
  const areaStatement = database.prepare('SELECT * FROM area_manager_approvals WHERE movement_id = ?')

  return movements.map((row) => {
    const safety = safetyStatement.get(row.id)
    const supply = supplyStatement.get(row.id)
    const area = areaStatement.get(row.id)
    return {
      id: row.id,
      requesterId: row.requester_id,
      movementDate: row.movement_date,
      purpose: row.purpose,
      etd: row.etd,
      eta: row.eta,
      startLocation: row.start_location,
      startLocationId: row.start_location_id ?? null,
      routePoints: JSON.parse(row.route_points_json),
      routePointLocationIds: JSON.parse(row.route_point_location_ids_json || '[]'),
      segments: segmentStatement.all(row.id).map((segment) => ({
        id: segment.id,
        movementId: row.id,
        sequence: Number(segment.sequence_number) + 1,
        code: segment.code,
        fromLocation: segment.from_location,
        toLocation: segment.to_location,
        arrivalTime: segment.arrival_time,
        departureTime: segment.departure_time,
        passengerIds: passengerStatement.all(segment.id).map((passenger) => passenger.user_id),
        fromLocationId: segment.from_location_id ?? null,
        toLocationId: segment.to_location_id ?? null,
        fromLatitude: segment.from_latitude ?? null,
        fromLongitude: segment.from_longitude ?? null,
        toLatitude: segment.to_latitude ?? null,
        toLongitude: segment.to_longitude ?? null,
      })),
      vehicleLeaderId: row.vehicle_leader_id,
      notes: row.notes,
      status: row.status,
      safetyReview: {
        reviewedBy: safety?.reviewed_by ?? null,
        reviewedAt: safety?.reviewed_at ?? null,
        decision: safety?.decision ?? null,
        comment: safety?.comment ?? null,
      },
      gpsAssignment: {
        type: safety?.gps_type ?? null,
        gpsDeviceId: safety?.gps_device_id ?? null,
      },
      supplyChainAssignment: {
        assignedBy: supply?.assigned_by ?? null,
        assignedAt: supply?.assigned_at ?? null,
        vehicleId: supply?.vehicle_id ?? null,
        driverId: supply?.driver_id ?? null,
        comment: supply?.comment ?? null,
      },
      areaManagerApproval: {
        decision: area?.decision ?? null,
        reviewedBy: area?.reviewed_by ?? null,
        reviewedAt: area?.reviewed_at ?? null,
        comment: area?.comment ?? null,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

function writeMovement(movement, transition = {}) {
  transaction(() => {
    const existing = database.prepare('SELECT status FROM movements WHERE id = ?').get(movement.id)
    database.prepare(`
      INSERT INTO movements (
        id, requester_id, movement_date, purpose, etd, eta, start_location, start_location_id, route_points_json, route_point_location_ids_json,
        vehicle_leader_id, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        requester_id=excluded.requester_id, movement_date=excluded.movement_date,
        purpose=excluded.purpose, etd=excluded.etd, eta=excluded.eta,
        start_location=excluded.start_location, start_location_id=excluded.start_location_id,
        route_points_json=excluded.route_points_json, route_point_location_ids_json=excluded.route_point_location_ids_json,
        vehicle_leader_id=excluded.vehicle_leader_id, notes=excluded.notes,
        status=excluded.status, updated_at=excluded.updated_at
    `).run(
      movement.id,
      movement.requesterId,
      movement.movementDate,
      movement.purpose,
      movement.etd,
      movement.eta,
      movement.startLocation,
      movement.startLocationId ?? null,
      JSON.stringify(movement.routePoints),
      JSON.stringify(movement.routePointLocationIds || []),
      movement.vehicleLeaderId,
      movement.notes,
      movement.status,
      movement.createdAt,
      movement.updatedAt,
    )

    database.prepare('DELETE FROM movement_segments WHERE movement_id = ?').run(movement.id)
    const segmentStatement = database.prepare(`
      INSERT INTO movement_segments (
        id, movement_id, sequence_number, code, from_location, to_location, from_location_id, to_location_id,
        from_latitude, from_longitude, to_latitude, to_longitude, arrival_time, departure_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const passengerStatement = database.prepare(`
      INSERT INTO movement_segment_passengers (segment_id, user_id, position) VALUES (?, ?, ?)
    `)
    movement.segments.forEach((segment, index) => {
      segmentStatement.run(
        segment.id,
        movement.id,
        index,
        segment.code,
        segment.fromLocation,
        segment.toLocation,
        segment.fromLocationId ?? null,
        segment.toLocationId ?? null,
        segment.fromLatitude ?? null,
        segment.fromLongitude ?? null,
        segment.toLatitude ?? null,
        segment.toLongitude ?? null,
        segment.arrivalTime,
        segment.departureTime,
      )
      segment.passengerIds.forEach((userId, position) => passengerStatement.run(segment.id, userId, position))
    })

    database.prepare(`
      INSERT INTO safety_reviews (
        movement_id, reviewed_by, reviewed_at, decision, comment, gps_type, gps_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(movement_id) DO UPDATE SET reviewed_by=excluded.reviewed_by,
        reviewed_at=excluded.reviewed_at, decision=excluded.decision, comment=excluded.comment,
        gps_type=excluded.gps_type, gps_device_id=excluded.gps_device_id
    `).run(
      movement.id,
      movement.safetyReview?.reviewedBy ?? null,
      movement.safetyReview?.reviewedAt ?? null,
      movement.safetyReview?.decision ?? null,
      movement.safetyReview?.comment ?? null,
      movement.gpsAssignment?.type ?? null,
      movement.gpsAssignment?.gpsDeviceId ?? null,
    )
    database.prepare(`
      INSERT INTO supply_chain_assignments (
        movement_id, assigned_by, assigned_at, vehicle_id, driver_id, comment
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(movement_id) DO UPDATE SET assigned_by=excluded.assigned_by,
        assigned_at=excluded.assigned_at, vehicle_id=excluded.vehicle_id,
        driver_id=excluded.driver_id, comment=excluded.comment
    `).run(
      movement.id,
      movement.supplyChainAssignment?.assignedBy ?? null,
      movement.supplyChainAssignment?.assignedAt ?? null,
      movement.supplyChainAssignment?.vehicleId ?? null,
      movement.supplyChainAssignment?.driverId ?? null,
      movement.supplyChainAssignment?.comment ?? null,
    )
    database.prepare(`
      INSERT INTO area_manager_approvals (
        movement_id, decision, reviewed_by, reviewed_at, comment
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(movement_id) DO UPDATE SET decision=excluded.decision,
        reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at,
        comment=excluded.comment
    `).run(
      movement.id,
      movement.areaManagerApproval?.decision ?? null,
      movement.areaManagerApproval?.reviewedBy ?? null,
      movement.areaManagerApproval?.reviewedAt ?? null,
      movement.areaManagerApproval?.comment ?? null,
    )

    if (!existing || existing.status !== movement.status) {
      database.prepare(`
        INSERT INTO movement_status_history (
          movement_id, status, changed_at, from_status, actor_id, context
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        movement.id,
        movement.status,
        movement.updatedAt,
        existing?.status ?? null,
        transition.actorId ?? null,
        transition.context ?? null,
      )
    }

    if (transition.audit) insertAuditLog(transition.audit)
  })
  return movement
}

function resetStoredMovements() {
  transaction(() => {
    database.exec("DELETE FROM movements; DELETE FROM sqlite_sequence WHERE name = 'movement_status_history';")
  })
}

function listMovementStatusHistory(movementId) {
  return database.prepare(`
    SELECT id, status, changed_at AS changedAt, from_status AS fromStatus,
      actor_id AS actorId, context
    FROM movement_status_history WHERE movement_id = ? ORDER BY id
  `).all(movementId)
}

module.exports = {
  getSettings,
  getSettingsRecord,
  insertAuditLog,
  listAuditLogs,
  listMovementStatusHistory,
  linkUserEntraIdentity,
  loadMovements,
  loadResources,
  loadUsers,
  replaceResources,
  replaceUsers,
  resetAuditLogs,
  resetStoredMovements,
  saveSettings,
  writeMovement,
}
