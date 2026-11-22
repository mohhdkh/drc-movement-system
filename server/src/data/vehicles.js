const seedData = require('../db/seedData')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

const vehicles = provider.loadResources('vehicles')

function persistVehicles(audit) {
  return provider.replaceResources('vehicles', vehicles.map((item) => ({ ...item })), audit)
}

function resetVehicles() {
  vehicles.splice(0, vehicles.length, ...seedData.vehicles.map((item) => ({ ...item })))
  persistVehicles()
}

module.exports = { persistVehicles, resetVehicles, vehicles }
