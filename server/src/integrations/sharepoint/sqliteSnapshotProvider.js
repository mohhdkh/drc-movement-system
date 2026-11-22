const { getOperationalProvider } = require('../../db/operationalDatabase')

class SQLiteSnapshotProvider {
  getSnapshot() {
    const provider = getOperationalProvider()
    const movements = provider.loadMovements()
    return {
      users: provider.loadUsers(),
      departments: provider.loadResources('departments'),
      vehicles: provider.loadResources('vehicles'),
      drivers: provider.loadResources('drivers'),
      gpsDevices: provider.loadResources('gpsDevices'),
      locations: provider.loadResources('locations'),
      settings: provider.getSettingsRecord(),
      auditLogs: provider.listAuditLogs(),
      movements,
      statusHistory: Object.fromEntries(
        movements.map((movement) => [movement.id, provider.listMovementStatusHistory(movement.id)]),
      ),
    }
  }

  getDryRunSummary() {
    const snapshot = this.getSnapshot()
    const segments = snapshot.movements.flatMap((movement) => movement.segments)
    return {
      users: snapshot.users.length,
      departments: snapshot.departments.length,
      vehicles: snapshot.vehicles.length,
      drivers: snapshot.drivers.length,
      gpsDevices: snapshot.gpsDevices.length,
      locations: snapshot.locations.length,
      settings: 1,
      auditLogs: snapshot.auditLogs.length,
      movements: snapshot.movements.length,
      segments: segments.length,
      passengers: segments.reduce((count, segment) => count + segment.passengerIds.length, 0),
      statusHistory: Object.values(snapshot.statusHistory).reduce((count, entries) => count + entries.length, 0),
    }
  }
}

module.exports = { SQLiteSnapshotProvider }
