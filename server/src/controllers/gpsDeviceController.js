const { gpsDevices } = require('../data/gpsDevices')

function listGpsDevices(_request, response) {
  response.json({
    data: gpsDevices
      .filter((device) => device.active)
      .map((device) => ({ ...device, name: device.label })),
  })
}

module.exports = { listGpsDevices }
