const { listAuditEntries, saveAuditEntry } = require('../data/adminAuditLog')
const { getAdminActor } = require('./adminAccessService')

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value))
}

function createAdminAuditEntry({ action, entityType, entityId, before, after }, { now = new Date() } = {}) {
  const actor = getAdminActor()
  return {
    timestamp: now.toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    action,
    entityType,
    entityId,
    before: clone(before),
    after: clone(after),
  }
}

function recordAdminAudit(change, options) {
  return saveAuditEntry(createAdminAuditEntry(change, options))
}

function getAdminAuditEntries({ entityType, action } = {}) {
  getAdminActor()
  return listAuditEntries().filter((entry) => (
    (!entityType || entry.entityType === entityType) &&
    (!action || entry.action === action)
  ))
}

module.exports = { createAdminAuditEntry, getAdminAuditEntries, recordAdminAudit }
