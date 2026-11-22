const express = require('express')
const { listGpsDevices } = require('../controllers/gpsDeviceController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.get('/', authenticate(), listGpsDevices)

module.exports = router
