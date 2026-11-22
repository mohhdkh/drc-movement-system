const { createPersistenceProviders } = require('../integrations/sharepoint/persistenceProvider')

let providers

function getProviders() {
  if (!providers) providers = createPersistenceProviders()
  return providers
}

async function syncMovementIfEnabled(movement) {
  const { sharePoint } = getProviders()
  if (!sharePoint.config.enabled) return { enabled: false, operations: 0 }
  const completed = await sharePoint.syncMovement(movement)
  return { enabled: true, operations: completed.length }
}

async function syncSnapshotIfEnabled() {
  const { sharePoint } = getProviders()
  if (!sharePoint.config.enabled) return { enabled: false, operations: 0 }
  const completed = await sharePoint.syncSnapshot()
  return { enabled: true, operations: completed.length }
}

async function getSharePointStatus() {
  const { sharePoint } = getProviders()
  const checkedAt = new Date().toISOString()
  try {
    const status = await sharePoint.verify()
    return { ...status, lastCheckedAt: checkedAt }
  } catch (error) {
    return {
      enabled: sharePoint.config.enabled,
      connected: false,
      siteResolved: false,
      siteDisplayName: null,
      requiredListsPresent: false,
      lastCheckedAt: checkedAt,
      errorCode: error.code || 'SHAREPOINT_STATUS_ERROR',
      message: error.message,
    }
  }
}

function resetInstitutionalPersistenceForTests() {
  providers = null
}

module.exports = {
  getSharePointStatus,
  resetInstitutionalPersistenceForTests,
  syncMovementIfEnabled,
  syncSnapshotIfEnabled,
}
