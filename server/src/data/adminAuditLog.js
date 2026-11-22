const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

function listAuditEntries() {
  return provider.listAuditLogs()
}

function saveAuditEntry(entry) {
  return provider.insertAuditLog(entry)
}

function resetAuditEntries() {
  return provider.resetAuditLogs()
}

module.exports = { listAuditEntries, resetAuditEntries, saveAuditEntry }
