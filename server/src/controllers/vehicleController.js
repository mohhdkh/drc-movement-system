const { vehicles } = require('../data/vehicles')

function listVehicles(_request, response) {
  response.json({
    data: vehicles
      .filter((vehicle) => vehicle.active)
      .map((vehicle) => ({ ...vehicle, description: vehicle.model })),
  })
}

module.exports = { listVehicles }
