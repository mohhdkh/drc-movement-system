import type { MovementStatus } from '../types'
import { formatMovementStatus } from '../utils/movement'

interface StatusBadgeProps {
  status: MovementStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {formatMovementStatus(status)}
    </span>
  )
}

