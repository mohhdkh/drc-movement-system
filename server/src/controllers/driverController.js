const { drivers } = require('../data/drivers')

function listDrivers(_request, response) {
  response.json({ data: drivers.filter((driver) => driver.active) })
}

module.exports = { listDrivers }

