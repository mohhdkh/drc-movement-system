const { getOperationalProvider } = require('../../db/operationalDatabase')
const { mapMovement, mapSnapshot } = require('./sharePointMapper')
const { createSharePointIntegration } = require('./sharePointIntegrationFactory')
const { SQLiteSnapshotProvider } = require('./sqliteSnapshotProvider')

class SQLitePersistenceProvider {
  constructor({ snapshotProvider = new SQLiteSnapshotProvider() } = {}) {
    this.kind = 'sqlite'
    this.snapshotProvider = snapshotProvider
  }

  snapshot() {
    return this.snapshotProvider.getSnapshot()
  }

  dryRunSummary() {
    return this.snapshotProvider.getDryRunSummary()
  }
}

class SharePointPersistenceProvider {
  constructor({ repository, config, snapshotProvider = new SQLiteSnapshotProvider() }) {
    this.kind = 'sharepoint'
    this.repository = repository
    this.config = config
    this.snapshotProvider = snapshotProvider
  }

  verify() {
    return this.repository.verifySchema()
  }

  provision() {
    return this.repository.provision()
  }

  async syncSnapshot() {
    const snapshot = this.snapshotProvider.getSnapshot()
    return this.repository.syncMappedRecords(mapSnapshot(snapshot))
  }

  async syncMovement(movement) {
    const history = getOperationalProvider().listMovementStatusHistory(movement.id)
    return this.repository.syncMappedRecords(mapMovement(movement, history))
  }

  dryRunSummary() {
    return this.snapshotProvider.getDryRunSummary()
  }
}

function createPersistenceProviders(options = {}) {
  const snapshotProvider = options.snapshotProvider || new SQLiteSnapshotProvider()
  const sqlite = new SQLitePersistenceProvider({ snapshotProvider })
  const integration = createSharePointIntegration(options)
  const sharePoint = new SharePointPersistenceProvider({
    repository: integration.repository,
    config: integration.config,
    snapshotProvider,
  })
  return {
    active: integration.config.enabled ? sharePoint : sqlite,
    sharePoint,
    sqlite,
  }
}

module.exports = {
  SharePointPersistenceProvider,
  SQLitePersistenceProvider,
  createPersistenceProviders,
}
