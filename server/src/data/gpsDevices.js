const seedData = require('../db/seedData')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

const gpsDevices = provider.loadResources('gpsDevices')

function persistGpsDevices(audit) {
  return provider.replaceResources('gpsDevices', gpsDevices.map((item) => ({ ...item })), audit)
}

function resetGpsDevices() {
  gpsDevices.splice(0, gpsDevices.length, ...seedData.gpsDevices.map((item) => ({ ...item })))
  persistGpsDevices()
}

module.exports = { gpsDevices, persistGpsDevices, resetGpsDevices }
