const { getOperationalProvider } = require('../db/operationalDatabase')

async function refreshOperationalData(request, _response, next) {
  try {
    const provider = getOperationalProvider()
    if (provider.name !== 'postgres') return next()
    if (request.path.startsWith('/api/health') || request.path === '/api/admin/system/database-status') {
      return next()
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      await provider.refreshCache({ allowStale: true })
    } else {
      await provider.waitForCacheRefresh()
    }

    const collections = [
      [require('../data/departments').departments, provider.loadResources('departments')],
      [require('../data/drivers').drivers, provider.loadResources('drivers')],
      [require('../data/gpsDevices').gpsDevices, provider.loadResources('gpsDevices')],
      [require('../data/locations').locations, provider.loadResources('locations')],
      [require('../data/vehicles').vehicles, provider.loadResources('vehicles')],
      [require('../data/users').users, provider.loadUsers()],
    ]
    for (const [target, source] of collections) target.splice(0, target.length, ...source)
    require('../data/movementStore').reloadMovements()
    require('../data/systemSettings').reloadSystemSettings()
    next()
  } catch (error) {
    next(error)
  }
}

module.exports = { refreshOperationalData }
