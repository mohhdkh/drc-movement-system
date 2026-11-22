import { useMemo } from 'react'
import type { Employee, Movement } from '../../types'
import { formatDateTime } from '../../utils/movement'

interface AreaManagerDecisionSummaryProps {
  movement: Movement
  employees: Employee[]
}

export function AreaManagerDecisionSummary({
  movement,
  employees,
}: AreaManagerDecisionSummaryProps) {
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.displayName])),
    [employees],
  )
  const approval = movement.areaManagerApproval

  if (!approval.decision) return null

  return (
    <div className={`area-manager-summary area-decision-${approval.decision.toLowerCase()}`}>
      <dl className="details-grid">
        <div><dt>Decision</dt><dd>{approval.decision}</dd></div>
        <div>
          <dt>Reviewed By</dt>
          <dd>{approval.reviewedBy ? employeeNames.get(approval.reviewedBy) ?? approval.reviewedBy : 'Unknown employee'}</dd>
        </div>
        <div>
          <dt>Reviewed At</dt>
          <dd>{approval.reviewedAt ? formatDateTime(approval.reviewedAt) : 'Not recorded'}</dd>
        </div>
        <div className="details-wide">
          <dt>Area Manager Comment</dt>
          <dd>{approval.comment || 'No comment provided.'}</dd>
        </div>
      </dl>
    </div>
  )
}
