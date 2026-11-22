const seedData = require('../db/seedData')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

const locations = provider.loadResources('locations')

function persistLocations(audit) {
  return provider.replaceResources('locations', locations.map((item) => ({ ...item })), audit)
}

function resetLocations() {
  locations.splice(0, locations.length, ...seedData.locations.map((item) => ({ ...item })))
  persistLocations()
}

module.exports = { locations, persistLocations, resetLocations }
