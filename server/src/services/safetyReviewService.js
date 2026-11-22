const { gpsDevices } = require('../data/gpsDevices')
const { replaceMovement } = require('../data/movementStore')
const { AppError, ValidationError } = require('../utils/AppError')
const { findGpsConflict } = require('./gpsConflictService')
const { getMovement, listMovements } = require('./movementService')
const { requireRole } = require('./roleService')

const ACTIONS = {
  APPROVE: { status: 'SAFETY_APPROVED', decision: 'APPROVED' },
  REJECT: { status: 'SAFETY_REJECTED', decision: 'REJECTED' },
  RETURN: { status: 'RETURNED_FOR_MODIFICATION', decision: 'RETURNED' },
}

function listSafetyMovements({ status } = {}) {
  const movements = listMovements()
    .filter((movement) => !status || movement.status === status)
    .sort((a, b) => {
      const pendingDifference =
        Number(b.status === 'PENDING_SAFETY') - Number(a.status === 'PENDING_SAFETY')
      return pendingDifference || b.createdAt.localeCompare(a.createdAt)
    })

  return movements
}

function getSafetyMovement(id) {
  return getMovement(id)
}

async function submitSafetyReview(id, input, { actor, now = new Date() } = {}) {
  const reviewer = requireRole(actor, 'SAFETY')
  const movement = getMovement(id)

  if (movement.status !== 'PENDING_SAFETY') {
    throw new AppError(
      'This movement is no longer pending Safety review.',
      409,
      [{ field: 'status', message: `Safety review is not allowed from ${movement.status}.` }],
    )
  }

  input = input && typeof input === 'object' ? input : {}
  const errors = []
  const action = typeof input.action === 'string' ? input.action.trim() : ''
  const actionConfig = ACTIONS[action]
  const reviewedBy = reviewer.id
  const comment = typeof input.comment === 'string' ? input.comment.trim() : ''
  let gpsAssignment = { type: null, gpsDeviceId: null }

  if (!actionConfig) {
    errors.push({ field: 'action', message: 'Select a valid Safety action.' })
  }

  if ((action === 'REJECT' || action === 'RETURN') && !comment) {
    errors.push({
      field: 'comment',
      message: `${action === 'REJECT' ? 'Rejection' : 'Return'} reason is required.`,
    })
  }

  if (action === 'APPROVE') {
    const assignment = input.gpsAssignment
    const type = assignment && typeof assignment.type === 'string' ? assignment.type : null
    const gpsDeviceId =
      assignment && typeof assignment.gpsDeviceId === 'string'
        ? assignment.gpsDeviceId.trim()
        : null

    if (type !== 'DEVICE' && type !== 'NO_GPS') {
      errors.push({
        field: 'gpsAssignment.type',
        message: 'Choose a GPS device or explicitly select No GPS Required.',
      })
    } else if (type === 'DEVICE') {
      const gpsDevice = gpsDevices.find(
        (device) => device.id === gpsDeviceId && device.active,
      )

      if (!gpsDeviceId) {
        errors.push({
          field: 'gpsAssignment.gpsDeviceId',
          message: 'Select an active GPS device.',
        })
      } else if (!gpsDevice) {
        errors.push({
          field: 'gpsAssignment.gpsDeviceId',
          message: 'The selected GPS device is inactive or does not exist.',
        })
      } else {
        gpsAssignment = { type: 'DEVICE', gpsDeviceId }
      }
    } else if (gpsDeviceId) {
      errors.push({
        field: 'gpsAssignment.gpsDeviceId',
        message: 'GPS device must be empty when No GPS Required is selected.',
      })
    } else {
      gpsAssignment = { type: 'NO_GPS', gpsDeviceId: null }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors, 'Safety review validation failed')
  }

  if (gpsAssignment.type === 'DEVICE') {
    const conflict = findGpsConflict(
      {
        id: movement.id,
        gpsDeviceId: gpsAssignment.gpsDeviceId,
        movementDate: movement.movementDate,
        etd: movement.etd,
        eta: movement.eta,
      },
      listMovements(),
    )

    if (conflict) {
      throw new AppError(
        'The selected GPS device is not available for this movement time.',
        409,
        [{
          field: 'gpsAssignment.gpsDeviceId',
          message: `${conflict.id} already uses this GPS from ${conflict.etd} to ${conflict.eta}.`,
        }],
      )
    }
  }

  const timestamp = now.toISOString()
  const updatedMovement = {
    ...movement,
    status: actionConfig.status,
    safetyReview: {
      reviewedBy,
      reviewedAt: timestamp,
      decision: actionConfig.decision,
      comment: comment || null,
    },
    gpsAssignment,
    updatedAt: timestamp,
  }

  return await replaceMovement(updatedMovement, { actorId: reviewer.id, context: comment || action })
}

module.exports = {
  getSafetyMovement,
  listSafetyMovements,
  submitSafetyReview,
}
