const { getOperationalDatabaseStatus } = require('../db/operationalDatabase')
const { getSharePointStatus } = require('../services/institutionalPersistenceService')

function getHealth(_request, response) {
  response.json({
    status: 'ok',
    service: 'DRC Movement System API',
  })
}

function getLiveness(_request, response) {
  response.json({ status: 'ok', service: 'DRC Movement System API' })
}

async function getReadiness(_request, response) {
  const [database, sharePoint] = await Promise.all([
    getOperationalDatabaseStatus(),
    getSharePointStatus(),
  ])
  const ready = database.connected && database.migrationStatus === 'up-to-date'
  response.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    checks: {
      database: {
        provider: database.provider,
        connected: database.connected,
        migrationStatus: database.migrationStatus,
      },
      sharePoint: {
        enabled: sharePoint.enabled,
        status: !sharePoint.enabled ? 'disabled' :
          (sharePoint.connected && sharePoint.requiredListsPresent ? 'ready' : 'unavailable'),
        required: false,
      },
    },
  })
}

module.exports = { getHealth, getLiveness, getReadiness }
