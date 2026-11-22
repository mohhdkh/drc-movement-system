const express = require('express')
const {
  getSafetyMovement,
  listFinalApprovedMovements,
  listSafetyMovements,
  submitSafetyReview,
} = require('../controllers/safetyController')
const { downloadMovementPlan } = require('../controllers/movementPlanController')
const { previewWhatsAppMovements } = require('../controllers/whatsAppMovementController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.use(authenticate({ developmentUserId: 'emp-002', roles: ['SAFETY'] }))

router.get('/movements', listSafetyMovements)
router.get('/movements/export.xlsx', downloadMovementPlan)
router.get('/movements/final-approved', listFinalApprovedMovements)
router.post('/movements/whatsapp-preview', previewWhatsAppMovements)
router.get('/movements/:id', getSafetyMovement)
router.patch('/movements/:id/review', submitSafetyReview)

module.exports = router
