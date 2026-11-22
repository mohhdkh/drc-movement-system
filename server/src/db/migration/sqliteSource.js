const { database } = require('../database')
const repositories = require('../repositories')

const countQueries = {
  users: 'users',
  roles: 'user_roles',
  departments: 'departments',
  vehicles: 'vehicles',
  drivers: 'drivers',
  gpsDevices: 'gps_devices',
  locations: 'locations',
  settings: 'system_settings',
  auditLogs: 'audit_logs',
  movements: 'movements',
  segments: 'movement_segments',
  passengers: 'movement_segment_passengers',
  safetyReviews: 'safety_reviews',
  supplyChainAssignments: 'supply_chain_assignments',
  areaManagerApprovals: 'area_manager_approvals',
  statusHistory: 'movement_status_history',
}

function getCounts() {
  return Object.fromEntries(Object.entries(countQueries).map(([name, table]) => [
    name,
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
  ]))
}

function getSnapshot() {
  const movements = repositories.loadMovements()
  return {
    users: repositories.loadUsers(),
    departments: repositories.loadResources('departments'),
    vehicles: repositories.loadResources('vehicles'),
    drivers: repositories.loadResources('drivers'),
    gpsDevices: repositories.loadResources('gpsDevices'),
    locations: repositories.loadResources('locations'),
    settings: repositories.getSettingsRecord(),
    auditLogs: repositories.listAuditLogs(),
    movements,
    statusHistory: Object.fromEntries(
      movements.map((movement) => [movement.id, repositories.listMovementStatusHistory(movement.id)]),
    ),
  }
}

function duplicateValues(items, property, normalize = (value) => value) {
  const seen = new Set()
  const duplicates = new Set()
  for (const item of items) {
    const value = item[property]
    if (value == null) continue
    const key = normalize(value)
    if (seen.has(key)) duplicates.add(value)
    seen.add(key)
  }
  return [...duplicates]
}

function validateSnapshot(snapshot) {
  const conflicts = []
  for (const [name, items] of Object.entries({
    users: snapshot.users,
    departments: snapshot.departments,
    vehicles: snapshot.vehicles,
    drivers: snapshot.drivers,
    gpsDevices: snapshot.gpsDevices,
    locations: snapshot.locations,
    movements: snapshot.movements,
  })) {
    for (const id of duplicateValues(items, 'id')) conflicts.push(`${name}: duplicate id ${id}`)
  }
  const lower = (value) => String(value).toLowerCase()
  for (const email of duplicateValues(snapshot.users, 'email', lower)) conflicts.push(`users: duplicate email ${email}`)
  for (const code of duplicateValues(snapshot.vehicles, 'code', lower)) conflicts.push(`vehicles: duplicate code ${code}`)
  for (const plate of duplicateValues(snapshot.vehicles, 'plateNumber', lower)) conflicts.push(`vehicles: duplicate plate ${plate}`)
  for (const code of duplicateValues(snapshot.gpsDevices, 'code', lower)) conflicts.push(`gpsDevices: duplicate code ${code}`)
  const userIds = new Set(snapshot.users.map((item) => item.id))
  for (const movement of snapshot.movements) {
    if (!userIds.has(movement.requesterId)) conflicts.push(`movements: unknown requester ${movement.requesterId}`)
    if (!userIds.has(movement.vehicleLeaderId)) conflicts.push(`movements: unknown vehicle leader ${movement.vehicleLeaderId}`)
    for (const segment of movement.segments) {
      if (!segment.arrivalTime || !segment.departureTime) conflicts.push(`segments: missing stop times ${segment.id}`)
      for (const userId of segment.passengerIds) {
        if (!userIds.has(userId)) conflicts.push(`passengers: unknown user ${userId}`)
      }
    }
  }
  return conflicts
}

module.exports = { getCounts, getSnapshot, validateSnapshot }
