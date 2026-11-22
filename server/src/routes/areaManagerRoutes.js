const express = require('express')
const {
  getAreaManagerMovement,
  listAreaManagerMovements,
  submitAreaManagerReview,
} = require('../controllers/areaManagerController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.use(authenticate({ developmentUserId: 'emp-004', roles: ['AREA_MANAGER'] }))

router.get('/movements', listAreaManagerMovements)
router.get('/movements/:id', getAreaManagerMovement)
router.patch('/movements/:id/review', submitAreaManagerReview)

module.exports = router
