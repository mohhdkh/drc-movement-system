const express = require('express')
const { listEmployees } = require('../controllers/employeeController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.get('/', authenticate(), listEmployees)

module.exports = router
