const repositories = require('../repositories')
const { databasePath } = require('../database')

class SqliteOperationalProvider {
  constructor() {
    this.name = 'sqlite'
    this.databasePath = databasePath
  }

  async initialize() {}
  loadResources(name) { return repositories.loadResources(name) }
  replaceResources(name, items, audit) {
    repositories.replaceResources(name, items)
    if (audit) repositories.insertAuditLog(audit)
  }
  loadUsers() { return repositories.loadUsers() }
  linkUserEntraIdentity(userId, identity, audit) {
    return repositories.linkUserEntraIdentity(userId, identity, audit)
  }
  replaceUsers(items, audit) {
    repositories.replaceUsers(items)
    if (audit) repositories.insertAuditLog(audit)
  }
  getSettings() { return repositories.getSettings() }
  getSettingsRecord() { return repositories.getSettingsRecord() }
  saveSettings(settings, audit) {
    repositories.saveSettings(settings)
    if (audit) repositories.insertAuditLog(audit)
  }
  listAuditLogs() { return repositories.listAuditLogs() }
  insertAuditLog(entry) { return repositories.insertAuditLog(entry) }
  resetAuditLogs() { return repositories.resetAuditLogs() }
  loadMovements() { return repositories.loadMovements() }
  writeMovement(movement, transition) { return repositories.writeMovement(movement, transition) }
  resetStoredMovements() { return repositories.resetStoredMovements() }
  listMovementStatusHistory(id) { return repositories.listMovementStatusHistory(id) }
  async status() {
    return {
      provider: this.name,
      connected: true,
      migrationStatus: 'up-to-date',
      serverTime: new Date().toISOString(),
      message: 'SQLite operational database connected',
    }
  }
  async close() {}
}

module.exports = { SqliteOperationalProvider }
