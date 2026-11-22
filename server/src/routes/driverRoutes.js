const express = require('express')
const { listDrivers } = require('../controllers/driverController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.get('/', authenticate(), listDrivers)

module.exports = router
