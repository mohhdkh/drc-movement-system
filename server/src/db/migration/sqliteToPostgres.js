const { withTransaction } = require('../postgres/pool')

const resources = {
  departments: { table: 'departments', fields: [['name', 'name']] },
  vehicles: { table: 'vehicles', fields: [['code', 'code'], ['plateNumber', 'plate_number'], ['model', 'model']] },
  drivers: { table: 'drivers', fields: [['name', 'name'], ['phone', 'phone']] },
  gpsDevices: { table: 'gps_devices', fields: [['code', 'code'], ['label', 'label']] },
  locations: { table: 'locations', fields: [['name', 'name'], ['latitude', 'latitude'], ['longitude', 'longitude']] },
}

async function upsertResources(client, snapshot) {
  for (const [name, definition] of Object.entries(resources)) {
    for (const item of snapshot[name]) {
      const columns = ['id', ...definition.fields.map(([, column]) => column), 'active', 'created_at', 'updated_at']
      const values = [item.id, ...definition.fields.map(([property]) => item[property]), item.active, item.createdAt, item.updatedAt]
      const update = columns.slice(1).map((column, index) => `${column}=$${index + 2}`).join(', ')
      await client.query(`
        INSERT INTO ${definition.table} (${columns.join(', ')})
        VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
        ON CONFLICT (id) DO UPDATE SET ${update}
      `, values)
    }
  }
}

async function upsertUsers(client, users) {
  for (const user of users) {
    await client.query(`
      INSERT INTO users (
        id, name, email, phone, department_id, entra_object_id, entra_tenant_id,
        entra_principal_name, active, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET name=$2, email=$3, phone=$4, department_id=$5,
        entra_object_id=COALESCE($6, users.entra_object_id),
        entra_tenant_id=COALESCE($7, users.entra_tenant_id),
        entra_principal_name=COALESCE($8, users.entra_principal_name),
        active=$9, created_at=$10, updated_at=$11
    `, [user.id, user.name, user.email, user.phone, user.departmentId,
      user.entraObjectId, user.entraTenantId, user.entraPrincipalName,
      user.active, user.createdAt, user.updatedAt])
    await client.query('DELETE FROM user_roles WHERE user_id=$1', [user.id])
    for (const role of user.roles) {
      await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2)', [user.id, role])
    }
  }
}

async function upsertMovement(client, movement) {
  await client.query(`
    INSERT INTO movements (
      id, requester_id, movement_date, purpose, etd, eta, start_location, route_points,
      vehicle_leader_id, notes, status, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET requester_id=$2, movement_date=$3, purpose=$4, etd=$5,
      eta=$6, start_location=$7, route_points=$8::jsonb, vehicle_leader_id=$9, notes=$10,
      status=$11, created_at=$12, updated_at=$13
  `, [movement.id, movement.requesterId, movement.movementDate, movement.purpose, movement.etd,
    movement.eta, movement.startLocation, JSON.stringify(movement.routePoints), movement.vehicleLeaderId,
    movement.notes, movement.status, movement.createdAt, movement.updatedAt])
  await client.query('DELETE FROM movement_segments WHERE movement_id=$1', [movement.id])
  for (let sequence = 0; sequence < movement.segments.length; sequence += 1) {
    const segment = movement.segments[sequence]
    await client.query(`
      INSERT INTO movement_segments (
        id, movement_id, sequence_number, code, from_location, to_location, arrival_time, departure_time
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [segment.id, movement.id, sequence, segment.code, segment.fromLocation, segment.toLocation,
      segment.arrivalTime, segment.departureTime])
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
  `, [movement.id, movement.safetyReview.reviewedBy, movement.safetyReview.reviewedAt,
    movement.safetyReview.decision, movement.safetyReview.comment,
    movement.gpsAssignment.type, movement.gpsAssignment.gpsDeviceId])
  await client.query(`
    INSERT INTO supply_chain_assignments (movement_id, assigned_by, assigned_at, vehicle_id, driver_id, comment)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (movement_id) DO UPDATE SET
      assigned_by=$2, assigned_at=$3, vehicle_id=$4, driver_id=$5, comment=$6
  `, [movement.id, movement.supplyChainAssignment.assignedBy, movement.supplyChainAssignment.assignedAt,
    movement.supplyChainAssignment.vehicleId, movement.supplyChainAssignment.driverId,
    movement.supplyChainAssignment.comment])
  await client.query(`
    INSERT INTO area_manager_approvals (movement_id, decision, reviewed_by, reviewed_at, comment)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (movement_id) DO UPDATE SET
      decision=$2, reviewed_by=$3, reviewed_at=$4, comment=$5
  `, [movement.id, movement.areaManagerApproval.decision, movement.areaManagerApproval.reviewedBy,
    movement.areaManagerApproval.reviewedAt, movement.areaManagerApproval.comment])
}

async function importSnapshot(pool, snapshot) {
  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['drc-sqlite-import'])
    await upsertResources(client, { ...snapshot, vehicles: [], drivers: [], gpsDevices: [], locations: [] })
    await upsertUsers(client, snapshot.users)
    await upsertResources(client, { ...snapshot, departments: [] })
    await client.query(`
      INSERT INTO system_settings (id, movement_timezone, movement_cutoff_hour, updated_at)
      VALUES ('system',$1,$2,$3) ON CONFLICT (id) DO UPDATE SET
        movement_timezone=$1, movement_cutoff_hour=$2, updated_at=$3
    `, [snapshot.settings.movementTimezone, snapshot.settings.movementCutoffHour, snapshot.settings.updatedAt])

    for (const movement of snapshot.movements) await upsertMovement(client, movement)
    for (const movement of snapshot.movements) {
      await client.query('DELETE FROM movement_status_history WHERE movement_id=$1', [movement.id])
      for (const entry of snapshot.statusHistory[movement.id] || []) {
        await client.query(`
          INSERT INTO movement_status_history (id, movement_id, status, changed_at, from_status, actor_id, context)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [entry.id, movement.id, entry.status, entry.changedAt, entry.fromStatus, entry.actorId, entry.context])
      }
    }
    for (const audit of snapshot.auditLogs) {
      const id = Number(String(audit.id).replace(/^AUD-/, ''))
      await client.query(`
        INSERT INTO audit_logs (id, timestamp, actor_id, actor_name, action, entity_type, entity_id, before_json, after_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT (id) DO UPDATE SET
          timestamp=$2, actor_id=$3, actor_name=$4, action=$5, entity_type=$6, entity_id=$7,
          before_json=$8::jsonb, after_json=$9::jsonb
      `, [id, audit.timestamp, audit.actorId, audit.actorName, audit.action, audit.entityType,
        audit.entityId, audit.before == null ? null : JSON.stringify(audit.before),
        audit.after == null ? null : JSON.stringify(audit.after)])
    }
    await client.query("SELECT setval(pg_get_serial_sequence('audit_logs','id'), COALESCE((SELECT MAX(id) FROM audit_logs), 1), EXISTS(SELECT 1 FROM audit_logs))")
    await client.query("SELECT setval(pg_get_serial_sequence('movement_status_history','id'), COALESCE((SELECT MAX(id) FROM movement_status_history), 1), EXISTS(SELECT 1 FROM movement_status_history))")
  })
}

const countQueries = {
  users: 'users', roles: 'user_roles', departments: 'departments', vehicles: 'vehicles',
  drivers: 'drivers', gpsDevices: 'gps_devices', locations: 'locations', settings: 'system_settings',
  auditLogs: 'audit_logs', movements: 'movements', segments: 'movement_segments',
  passengers: 'movement_segment_passengers', safetyReviews: 'safety_reviews',
  supplyChainAssignments: 'supply_chain_assignments', areaManagerApprovals: 'area_manager_approvals',
  statusHistory: 'movement_status_history',
}

async function getPostgresCounts(pool) {
  const result = {}
  for (const [name, table] of Object.entries(countQueries)) {
    const count = await pool.query(`SELECT COUNT(*)::integer AS count FROM ${table}`)
    result[name] = count.rows[0].count
  }
  return result
}

async function getExistingIdCounts(pool, snapshot) {
  const candidates = {
    users: ['users', snapshot.users], departments: ['departments', snapshot.departments],
    vehicles: ['vehicles', snapshot.vehicles], drivers: ['drivers', snapshot.drivers],
    gpsDevices: ['gps_devices', snapshot.gpsDevices], locations: ['locations', snapshot.locations],
    movements: ['movements', snapshot.movements],
  }
  const result = {}
  for (const [name, [table, items]] of Object.entries(candidates)) {
    if (!items.length) { result[name] = 0; continue }
    const query = await pool.query(`SELECT COUNT(*)::integer AS count FROM ${table} WHERE id = ANY($1::text[])`, [items.map((item) => item.id)])
    result[name] = query.rows[0].count
  }
  return result
}

module.exports = { getExistingIdCounts, getPostgresCounts, importSnapshot }
