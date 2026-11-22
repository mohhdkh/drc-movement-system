const { randomUUID } = require('crypto')
const {
  findMovementById,
  listMovements: listStoredMovements,
  replaceMovement,
  saveMovement,
} = require('../data/movementStore')
const { AppError, ValidationError } = require('../utils/AppError')
const { generateSegments } = require('./segmentService')
const { validateMovementRequest } = require('./movementValidationService')
const { getCutoffContext, isAfterSubmissionCutoff } = require('./cutoffService')
const { requireRole } = require('./roleService')

function listMovements({ requesterId } = {}) {
  const movements = listStoredMovements().map(normalizeMovement)
  return requesterId
    ? movements.filter((movement) => movement.requesterId === requesterId)
    : movements
}

function getMovement(id) {
  const movement = findMovementById(id)

  if (!movement) {
    throw new AppError('Movement request not found.', 404)
  }

  return normalizeMovement(movement)
}

function getEmployeeMovement(id, actor) {
  requireRole(actor, 'EMPLOYEE')
  const movement = getMovement(id)
  if (movement.requesterId !== actor.id) {
    throw new AppError('Movement request not found.', 404)
  }
  return movement
}

function normalizeMovement(movement) {
  return {
    ...movement,
    segments: Array.isArray(movement.segments)
      ? movement.segments.map((segment) => ({
          arrivalTime: null,
          departureTime: null,
          ...segment,
        }))
      : [],
    safetyReview: {
      reviewedBy: null,
      reviewedAt: null,
      decision: null,
      comment: null,
      ...(movement.safetyReview || {}),
    },
    gpsAssignment: {
      type: null,
      gpsDeviceId: null,
      ...(movement.gpsAssignment || {}),
    },
    supplyChainAssignment: {
      assignedBy: null,
      assignedAt: null,
      vehicleId: null,
      driverId: null,
      comment: null,
      ...(movement.supplyChainAssignment || {}),
    },
    areaManagerApproval: {
      decision: null,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
      ...(movement.areaManagerApproval || {}),
    },
  }
}

async function createMovement(input, options = {}) {
  const actor = requireRole(options.actor, 'EMPLOYEE')
  const normalized = validateMovementRequest({ ...input, requesterId: actor.id }, options)
  const now = options.now || new Date()
  const movementId = `MOV-${randomUUID().slice(0, 8).toUpperCase()}`
  const timestamp = now.toISOString()
  const segments = generateSegments({
    movementId,
    startLocation: normalized.startLocation,
    startLocationId: normalized.startLocationId,
    routePoints: normalized.routePoints,
    routePointLocationIds: normalized.routePointLocationIds,
    segmentInputs: normalized.segments,
  })
  const movement = {
    id: movementId,
    requesterId: normalized.requesterId,
    movementDate: normalized.movementDate,
    purpose: normalized.purpose,
    etd: normalized.etd,
    eta: normalized.eta,
    startLocation: normalized.startLocation,
    startLocationId: normalized.startLocationId,
    routePointLocationIds: normalized.routePointLocationIds,
    routePoints: normalized.routePoints,
    segments,
    vehicleLeaderId: normalized.vehicleLeaderId,
    notes: normalized.notes,
    status: 'PENDING_SAFETY',
    safetyReview: {
      reviewedBy: null,
      reviewedAt: null,
      decision: null,
      comment: null,
    },
    gpsAssignment: {
      type: null,
      gpsDeviceId: null,
    },
    supplyChainAssignment: {
      assignedBy: null,
      assignedAt: null,
      vehicleId: null,
      driverId: null,
      comment: null,
    },
    areaManagerApproval: {
      decision: null,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return await saveMovement(movement, { actorId: actor.id, context: 'Movement request submitted.' })
}

function editableInput(input, movement) {
  const source = input && typeof input === 'object' ? input : {}
  const editable = {
    requesterId: movement.requesterId,
    movementDate: source.movementDate ?? movement.movementDate,
    purpose: source.purpose ?? movement.purpose,
    startLocation: source.startLocation ?? movement.startLocation,
    routePoints: source.routePoints ?? movement.routePoints,
    vehicleLeaderId: source.vehicleLeaderId ?? movement.vehicleLeaderId,
    notes: source.notes ?? movement.notes,
    segments: source.segments ?? movement.segments.map((segment) => ({
      arrivalTime: segment.arrivalTime,
      departureTime: segment.departureTime,
      passengerIds: [...segment.passengerIds],
    })),
  }
  const usesMasterLocations = source.startLocationId !== undefined ||
    source.routePointLocationIds !== undefined ||
    Boolean(movement.startLocationId) ||
    Boolean(movement.routePointLocationIds?.length)
  if (usesMasterLocations) {
    editable.startLocationId = source.startLocationId ?? movement.startLocationId ?? ''
    editable.routePointLocationIds = source.routePointLocationIds ?? movement.routePointLocationIds ?? []
    editable.startDepartureTime = source.startDepartureTime ?? movement.etd
  }
  return editable
}

function movementAuditSnapshot(movement) {
  return {
    movementDate: movement.movementDate,
    purpose: movement.purpose,
    etd: movement.etd,
    eta: movement.eta,
    startLocation: movement.startLocation,
    routePoints: [...movement.routePoints],
    vehicleLeaderId: movement.vehicleLeaderId,
    notes: movement.notes,
    segments: movement.segments.map((segment) => ({
      code: segment.code,
      arrivalTime: segment.arrivalTime,
      departureTime: segment.departureTime,
      passengerIds: [...segment.passengerIds],
    })),
    status: movement.status,
  }
}

async function updateEmployeeMovement(id, input, options = {}) {
  const actor = requireRole(options.actor, 'EMPLOYEE')
  const existing = getMovement(id)

  if (existing.requesterId !== actor.id) {
    throw new AppError('You can only edit your own movement requests.', 403)
  }
  const isPendingFirstReview = existing.status === 'PENDING_SAFETY' &&
    !existing.safetyReview.decision &&
    !existing.safetyReview.reviewedAt
  const isReturnedForModification = existing.status === 'RETURNED_FOR_MODIFICATION' &&
    existing.safetyReview.decision === 'RETURNED'
  if (!isPendingFirstReview && !isReturnedForModification) {
    throw new AppError('This movement request can no longer be edited.', 409)
  }

  const now = options.now || new Date()
  if (isAfterSubmissionCutoff(existing.movementDate, now)) {
    const cutoff = getCutoffContext(existing.movementDate)
    throw new ValidationError([{
      field: 'movementDate',
      message: `Editing closed at ${String(cutoff.cutoffHour).padStart(2, '0')}:00 on ${cutoff.cutoffDate} (${cutoff.timeZone}).`,
    }], 'Movement request editing is closed')
  }

  const normalized = validateMovementRequest(editableInput(input, existing), { now })
  const timestamp = now.toISOString()
  const updated = {
    ...existing,
    movementDate: normalized.movementDate,
    purpose: normalized.purpose,
    etd: normalized.etd,
    eta: normalized.eta,
    startLocation: normalized.startLocation,
    startLocationId: normalized.startLocationId,
    routePoints: normalized.routePoints,
    routePointLocationIds: normalized.routePointLocationIds,
    vehicleLeaderId: normalized.vehicleLeaderId,
    notes: normalized.notes,
    segments: generateSegments({
      movementId: existing.id,
      startLocation: normalized.startLocation,
      startLocationId: normalized.startLocationId,
      routePoints: normalized.routePoints,
      routePointLocationIds: normalized.routePointLocationIds,
      segmentInputs: normalized.segments,
    }),
    status: 'PENDING_SAFETY',
    safetyReview: {
      reviewedBy: null,
      reviewedAt: null,
      decision: null,
      comment: null,
    },
    gpsAssignment: {
      type: null,
      gpsDeviceId: null,
    },
    updatedAt: timestamp,
  }
  const audit = {
    timestamp,
    actorId: actor.id,
    actorName: actor.name,
    action: 'MOVEMENT_UPDATED',
    entityType: 'MOVEMENT',
    entityId: existing.id,
    before: movementAuditSnapshot(existing),
    after: movementAuditSnapshot(updated),
  }

  return await replaceMovement(updated, {
    actorId: actor.id,
    context: isReturnedForModification
      ? 'Movement request edited and resubmitted after Safety return.'
      : 'Movement request edited by Employee before cutoff.',
    allowSameStatus: isPendingFirstReview,
    allowedFromStatuses: isReturnedForModification ? ['RETURNED_FOR_MODIFICATION'] : [],
    audit,
  })
}

module.exports = {
  createMovement,
  getEmployeeMovement,
  getMovement,
  listMovements,
  normalizeMovement,
  updateEmployeeMovement,
}
