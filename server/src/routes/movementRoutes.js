const express = require('express')
const {
  createMovement,
  getMovement,
  listMovements,
  updateMovement,
} = require('../controllers/movementController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.use(authenticate({ developmentUserId: 'emp-001', roles: ['EMPLOYEE'] }))

router.route('/').get(listMovements).post(createMovement)
router.route('/:id').get(getMovement).patch(updateMovement)

module.exports = router
