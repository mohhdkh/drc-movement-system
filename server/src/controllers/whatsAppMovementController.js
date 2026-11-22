const {
  createWhatsAppBatchText,
  createWhatsAppMovementText,
} = require('../services/whatsAppMovementService')

function getWhatsAppMovementText(request, response) {
  response.set('Cache-Control', 'no-store')
  response.json({ data: createWhatsAppMovementText({ movementId: request.params.id }) })
}

function previewWhatsAppMovements(request, response) {
  response.set('Cache-Control', 'no-store')
  response.json({ data: createWhatsAppBatchText(request.body) })
}

module.exports = { getWhatsAppMovementText, previewWhatsAppMovements }
