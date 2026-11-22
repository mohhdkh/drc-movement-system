const seedData = require('../db/seedData')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

const drivers = provider.loadResources('drivers')

function persistDrivers(audit) {
  return provider.replaceResources('drivers', drivers.map((item) => ({ ...item })), audit)
}

function resetDrivers() {
  drivers.splice(0, drivers.length, ...seedData.drivers.map((item) => ({ ...item })))
  persistDrivers()
}

module.exports = { drivers, persistDrivers, resetDrivers }
