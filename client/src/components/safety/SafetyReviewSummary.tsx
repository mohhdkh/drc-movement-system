import { useMemo } from 'react'
import type { Employee, GPSDevice, Movement } from '../../types'
import { formatDateTime } from '../../utils/movement'

interface SafetyReviewSummaryProps {
  movement: Movement
  employees: Employee[]
  gpsDevices: GPSDevice[]
}

export function SafetyReviewSummary({
  movement,
  employees,
  gpsDevices,
}: SafetyReviewSummaryProps) {
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.displayName])),
    [employees],
  )
  const gpsDevice = gpsDevices.find(
    (device) => device.id === movement.gpsAssignment.gpsDeviceId,
  )
  const review = movement.safetyReview

  if (!review.decision) return null

  const gpsLabel = movement.gpsAssignment.type === 'NO_GPS'
    ? 'No GPS Required'
    : movement.gpsAssignment.type === 'DEVICE'
      ? gpsDevice
        ? `${gpsDevice.code} - ${gpsDevice.name}`
        : movement.gpsAssignment.gpsDeviceId ?? 'Unknown GPS device'
      : 'Not assigned'

  return (
    <div className={`review-summary review-decision-${review.decision.toLowerCase()}`}>
      <dl className="details-grid">
        <div><dt>Decision</dt><dd>{review.decision}</dd></div>
        <div><dt>Reviewed By</dt><dd>{review.reviewedBy ? employeeNames.get(review.reviewedBy) ?? review.reviewedBy : 'Unknown employee'}</dd></div>
        <div><dt>Reviewed At</dt><dd>{review.reviewedAt ? formatDateTime(review.reviewedAt) : 'Not recorded'}</dd></div>
        {review.decision === 'APPROVED' && <div><dt>GPS Assignment</dt><dd>{gpsLabel}</dd></div>}
        <div className="details-wide"><dt>Safety Comment</dt><dd>{review.comment || 'No comment provided.'}</dd></div>
      </dl>
    </div>
  )
}

