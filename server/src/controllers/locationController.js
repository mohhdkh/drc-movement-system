const { locations } = require('../data/locations')

function listLocations(_request, response) {
  response.json({
    data: locations
      .filter((location) => location.active)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })),
  })
}

module.exports = { listLocations }