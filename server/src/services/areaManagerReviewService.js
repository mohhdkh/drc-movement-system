const { replaceMovement } = require('../data/movementStore')
const { AppError, ValidationError } = require('../utils/AppError')
const { requireRole } = require('./roleService')
const { getMovement, listMovements } = require('./movementService')

const AREA_MANAGER_VISIBLE_STATUSES = new Set([
  'VEHICLE_ASSIGNED',
  'FINAL_APPROVED',
  'FINAL_REJECTED',
])
const DECISIONS = {
  APPROVED: 'FINAL_APPROVED',
  REJECTED: 'FINAL_REJECTED',
}

function listAreaManagerMovements({ status } = {}) {
  return listMovements()
    .filter((movement) => (
      AREA_MANAGER_VISIBLE_STATUSES.has(movement.status) &&
      (!status || movement.status === status)
    ))
    .sort((a, b) => {
      const awaitingDifference =
        Number(b.status === 'VEHICLE_ASSIGNED') - Number(a.status === 'VEHICLE_ASSIGNED')
      return awaitingDifference || b.createdAt.localeCompare(a.createdAt)
    })
}

function getAreaManagerMovement(id) {
  const movement = getMovement(id)

  if (!AREA_MANAGER_VISIBLE_STATUSES.has(movement.status)) {
    throw new AppError('Movement request not found in the Area Manager workspace.', 404)
  }

  return movement
}

async function submitAreaManagerReview(id, input, { actor, now = new Date() } = {}) {
  const reviewer = requireRole(actor, 'AREA_MANAGER')
  const movement = getMovement(id)

  if (movement.status !== 'VEHICLE_ASSIGNED') {
    throw new AppError(
      'This movement is not awaiting Area Manager review.',
      409,
      [{
        field: 'status',
        message: `Area Manager review is not allowed from ${movement.status}.`,
      }],
    )
  }

  input = input && typeof input === 'object' ? input : {}
  const errors = []
  const decision = typeof input.decision === 'string' ? input.decision.trim() : ''
  const comment = typeof input.comment === 'string' ? input.comment.trim() : ''
  const resultingStatus = DECISIONS[decision]

  if (!resultingStatus) {
    errors.push({ field: 'decision', message: 'Select a valid Area Manager decision.' })
  }

  if (decision === 'REJECTED' && !comment) {
    errors.push({ field: 'comment', message: 'Rejection reason is required.' })
  }

  if (errors.length > 0) {
    throw new ValidationError(errors, 'Area Manager review validation failed')
  }

  const timestamp = now.toISOString()
  const updatedMovement = {
    ...movement,
    status: resultingStatus,
    areaManagerApproval: {
      decision,
      reviewedBy: reviewer.id,
      reviewedAt: timestamp,
      comment: comment || null,
    },
    updatedAt: timestamp,
  }

  return await replaceMovement(updatedMovement, { actorId: reviewer.id, context: comment || decision })
}

module.exports = {
  AREA_MANAGER_VISIBLE_STATUSES,
  getAreaManagerMovement,
  listAreaManagerMovements,
  submitAreaManagerReview,
}
