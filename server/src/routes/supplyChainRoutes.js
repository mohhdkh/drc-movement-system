const express = require('express')
const {
  getSupplyChainMovement,
  listSupplyChainMovements,
  submitSupplyChainAssignment,
} = require('../controllers/supplyChainController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.use(authenticate({ developmentUserId: 'emp-006', roles: ['SUPPLY_CHAIN'] }))

router.get('/movements', listSupplyChainMovements)
router.get('/movements/:id', getSupplyChainMovement)
router.patch('/movements/:id/assignment', submitSupplyChainAssignment)

module.exports = router
