const express = require('express')
const { listVehicles } = require('../controllers/vehicleController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.get('/', authenticate(), listVehicles)

module.exports = router
