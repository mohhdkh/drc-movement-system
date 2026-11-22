import { useMemo } from 'react'
import type { Driver, Employee, Movement, Vehicle } from '../../types'
import { formatDateTime } from '../../utils/movement'

interface SupplyChainAssignmentSummaryProps {
  movement: Movement
  employees: Employee[]
  vehicles: Vehicle[]
  drivers: Driver[]
}

export function SupplyChainAssignmentSummary({
  movement,
  employees,
  vehicles,
  drivers,
}: SupplyChainAssignmentSummaryProps) {
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.displayName])),
    [employees],
  )
  const assignment = movement.supplyChainAssignment
  const vehicle = vehicles.find((item) => item.id === assignment.vehicleId)
  const driver = drivers.find((item) => item.id === assignment.driverId)

  if (!assignment.assignedAt) return null

  return (
    <div className="assignment-summary">
      <dl className="details-grid">
        <div>
          <dt>Vehicle</dt>
          <dd>{vehicle ? `${vehicle.code} - ${vehicle.plateNumber} (${vehicle.description})` : assignment.vehicleId ?? 'Unknown vehicle'}</dd>
        </div>
        <div>
          <dt>Driver</dt>
          <dd>{driver ? `${driver.name}${driver.phone ? ` - ${driver.phone}` : ''}` : assignment.driverId ?? 'Unknown driver'}</dd>
        </div>
        <div>
          <dt>Assigned By</dt>
          <dd>{assignment.assignedBy ? employeeNames.get(assignment.assignedBy) ?? assignment.assignedBy : 'Unknown employee'}</dd>
        </div>
        <div>
          <dt>Assigned At</dt>
          <dd>{formatDateTime(assignment.assignedAt)}</dd>
        </div>
        <div className="details-wide">
          <dt>Supply Chain Comment</dt>
          <dd>{assignment.comment || 'No comment provided.'}</dd>
        </div>
      </dl>
    </div>
  )
}

