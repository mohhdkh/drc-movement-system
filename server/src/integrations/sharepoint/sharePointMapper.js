function title(domainId) {
  return { Title: domainId }
}

function mapMovement(movement, statusHistory = []) {
  const records = {
    movementRequests: [{
      ...title(movement.id),
      MovementId: movement.id,
      MovementDate: `${movement.movementDate}T00:00:00Z`,
      Purpose: movement.purpose,
      OverallETD: movement.etd,
      OverallETA: movement.eta,
      StartPoint: movement.startLocation,
      Notes: movement.notes,
      RequesterId: movement.requesterId,
      VehicleLeaderId: movement.vehicleLeaderId,
      CurrentStatus: movement.status,
      CreatedAt: movement.createdAt,
      UpdatedAt: movement.updatedAt,
    }],
    movementSegments: [],
    movementSegmentPassengers: [],
    movementStatusHistory: statusHistory.map((entry) => ({
      ...title(`${movement.id}:${entry.id}`),
      HistoryId: `${movement.id}:${entry.id}`,
      MovementId: movement.id,
      FromStatus: entry.fromStatus,
      ToStatus: entry.status,
      ActorId: entry.actorId,
      Timestamp: entry.changedAt,
      Context: entry.context,
    })),
    safetyReviews: [{
      ...title(movement.id),
      MovementId: movement.id,
      Decision: movement.safetyReview.decision,
      ReviewedBy: movement.safetyReview.reviewedBy,
      ReviewedAt: movement.safetyReview.reviewedAt,
      Comment: movement.safetyReview.comment,
      GPSDeviceId: movement.gpsAssignment.gpsDeviceId,
      ExplicitNoGPS: movement.gpsAssignment.type === 'NO_GPS',
    }],
    supplyChainAssignments: [{
      ...title(movement.id),
      MovementId: movement.id,
      AssignedBy: movement.supplyChainAssignment.assignedBy,
      AssignedAt: movement.supplyChainAssignment.assignedAt,
      VehicleId: movement.supplyChainAssignment.vehicleId,
      DriverId: movement.supplyChainAssignment.driverId,
      Comment: movement.supplyChainAssignment.comment,
    }],
    areaManagerApprovals: [{
      ...title(movement.id),
      MovementId: movement.id,
      Decision: movement.areaManagerApproval.decision,
      ReviewedBy: movement.areaManagerApproval.reviewedBy,
      ReviewedAt: movement.areaManagerApproval.reviewedAt,
      Comment: movement.areaManagerApproval.comment,
    }],
  }

  movement.segments.forEach((segment, sequence) => {
    records.movementSegments.push({
      ...title(segment.id), SegmentId: segment.id, MovementId: movement.id,
      SegmentCode: segment.code, Sequence: sequence, FromLocation: segment.fromLocation,
      ToLocation: segment.toLocation, ArrivalTime: segment.arrivalTime, DepartureTime: segment.departureTime,
    })
    segment.passengerIds.forEach((passengerId, passengerSequence) => {
      const recordId = `${segment.id}:${passengerId}`
      records.movementSegmentPassengers.push({
        ...title(recordId), PassengerRecordId: recordId, MovementId: movement.id,
        SegmentId: segment.id, PassengerId: passengerId, Sequence: passengerSequence,
      })
    })
  })
  return records
}

function mapMasterData(snapshot) {
  return {
    users: snapshot.users.map((user) => ({
      ...title(user.id), UserId: user.id, DisplayName: user.name, Email: user.email,
      Phone: user.phone, DepartmentId: user.departmentId, RolesJson: JSON.stringify(user.roles),
      Active: user.active, CreatedAt: user.createdAt, UpdatedAt: user.updatedAt,
    })),
    departments: snapshot.departments.map((item) => ({
      ...title(item.id), DepartmentId: item.id, DepartmentName: item.name, Active: item.active,
      CreatedAt: item.createdAt, UpdatedAt: item.updatedAt,
    })),
    vehicles: snapshot.vehicles.map((item) => ({
      ...title(item.id), VehicleId: item.id, VehicleCode: item.code, PlateNumber: item.plateNumber,
      Model: item.model, Active: item.active, CreatedAt: item.createdAt, UpdatedAt: item.updatedAt,
    })),
    drivers: snapshot.drivers.map((item) => ({
      ...title(item.id), DriverId: item.id, DriverName: item.name, Phone: item.phone,
      Active: item.active, CreatedAt: item.createdAt, UpdatedAt: item.updatedAt,
    })),
    gpsDevices: snapshot.gpsDevices.map((item) => ({
      ...title(item.id), GPSDeviceId: item.id, GPSCode: item.code, GPSLabel: item.label,
      Active: item.active, CreatedAt: item.createdAt, UpdatedAt: item.updatedAt,
    })),
    locations: snapshot.locations.map((item) => ({
      ...title(item.id), LocationId: item.id, LocationName: item.name, Latitude: item.latitude,
      Longitude: item.longitude, Active: item.active, CreatedAt: item.createdAt, UpdatedAt: item.updatedAt,
    })),
    systemSettings: [{
      ...title('system'), SettingsId: 'system', MovementTimezone: snapshot.settings.movementTimezone,
      MovementCutoffHour: snapshot.settings.movementCutoffHour, UpdatedAt: snapshot.settings.updatedAt,
    }],
    adminAuditLog: snapshot.auditLogs.map((entry) => ({
      ...title(entry.id), AuditId: entry.id, Timestamp: entry.timestamp, ActorId: entry.actorId,
      ActorName: entry.actorName, Action: entry.action, EntityType: entry.entityType,
      EntityId: entry.entityId, BeforeJson: entry.before == null ? null : JSON.stringify(entry.before),
      AfterJson: entry.after == null ? null : JSON.stringify(entry.after),
    })),
  }
}

function mapSnapshot(snapshot) {
  const mapped = mapMasterData(snapshot)
  for (const movement of snapshot.movements) {
    const aggregate = mapMovement(movement, snapshot.statusHistory[movement.id] || [])
    for (const [listName, records] of Object.entries(aggregate)) {
      mapped[listName] = [...(mapped[listName] || []), ...records]
    }
  }
  return mapped
}

module.exports = { mapMasterData, mapMovement, mapSnapshot }
