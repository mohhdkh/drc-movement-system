const { drivers } = require('../data/drivers')
const { gpsDevices } = require('../data/gpsDevices')
const { locations } = require('../data/locations')
const { users } = require('../data/users')
const { vehicles } = require('../data/vehicles')
const { listMovements } = require('./movementService')
const { isValidDateOnly } = require('./cutoffService')
const { formatWhatsAppMovement } = require('./whatsAppMovementFormatter')
const { mapWhatsAppMovement, validateMovementId } = require('./whatsAppMovementMapper')
const { AppError } = require('../utils/AppError')

const BLOCK_SEPARATOR = '\n\n--------------------\n\n'

function chronologicalMovementSort(left, right) {
  return left.movementDate.localeCompare(right.movementDate) ||
    String(left.etd || '').localeCompare(String(right.etd || '')) ||
    String(left.eta || '').localeCompare(String(right.eta || '')) ||
    String(left.createdAt || '').localeCompare(String(right.createdAt || '')) ||
    left.id.localeCompare(right.id)
}

function validateDate(value) {
  const date = typeof value === 'string' ? value.trim() : ''
  if (!isValidDateOnly(date)) {
    throw new AppError(
      'A valid movement date is required.',
      400,
      [{ field: 'date', message: 'Use a valid date in YYYY-MM-DD format.' }],
      'WHATSAPP_DATE_INVALID',
    )
  }
  return date
}

function listFinalApprovedMovementsByDate(value) {
  const date = validateDate(value)
  return listMovements()
    .filter((movement) => (
      movement.status === 'FINAL_APPROVED' && movement.movementDate === date
    ))
    .sort(chronologicalMovementSort)
}

function validateSelectedMovements(input, movements) {
  input = input && typeof input === 'object' ? input : {}
  const date = validateDate(input.date)
  const errors = []
  const movementIds = []
  const seen = new Set()

  if (!Array.isArray(input.movementIds) || input.movementIds.length === 0) {
    errors.push({ field: 'movementIds', message: 'Select at least one movement.' })
  } else {
    input.movementIds.forEach((value, index) => {
      try {
        const movementId = validateMovementId(value)
        if (seen.has(movementId)) {
          errors.push({ field: `movementIds.${index}`, message: `${movementId} is selected more than once.` })
          return
        }
        seen.add(movementId)
        movementIds.push(movementId)
      } catch {
        errors.push({ field: `movementIds.${index}`, message: 'Movement ID is invalid.' })
      }
    })
  }

  const movementIndex = new Map(movements.map((movement) => [movement.id, movement]))
  const selected = []
  movementIds.forEach((movementId, index) => {
    const movement = movementIndex.get(movementId)
    if (!movement || movement.status !== 'FINAL_APPROVED') {
      errors.push({
        field: `movementIds.${index}`,
        message: `${movementId} is not an available final-approved movement.`,
      })
    } else if (movement.movementDate !== date) {
      errors.push({
        field: `movementIds.${index}`,
        message: `${movementId} does not belong to ${date}.`,
      })
    } else {
      selected.push(movement)
    }
  })

  if (errors.length) {
    throw new AppError(
      'WhatsApp batch selection is invalid.',
      400,
      errors,
      'WHATSAPP_BATCH_INVALID',
    )
  }

  return { date, movements: selected.sort(chronologicalMovementSort) }
}

function createWhatsAppMovementText({ movementId }) {
  const mappedMovement = mapWhatsAppMovement({
    movements: listMovements(),
    users,
    locations,
    vehicles,
    drivers,
    gpsDevices,
    movementId,
  })

  return {
    movementId: mappedMovement.movementId,
    text: formatWhatsAppMovement(mappedMovement),
  }
}

function createWhatsAppBatchText(input) {
  const movements = listMovements()
  const selection = validateSelectedMovements(input, movements)
  const blocks = selection.movements.map((movement) => {
    const mappedMovement = mapWhatsAppMovement({
      movements,
      users,
      locations,
      vehicles,
      drivers,
      gpsDevices,
      movementId: movement.id,
    })
    return {
      movementId: mappedMovement.movementId,
      text: formatWhatsAppMovement(mappedMovement),
    }
  })

  return {
    date: selection.date,
    movementIds: blocks.map((block) => block.movementId),
    movementCount: blocks.length,
    text: blocks.map((block) => block.text).join(BLOCK_SEPARATOR),
  }
}

module.exports = {
  BLOCK_SEPARATOR,
  chronologicalMovementSort,
  createWhatsAppBatchText,
  createWhatsAppMovementText,
  listFinalApprovedMovementsByDate,
  validateSelectedMovements,
}
