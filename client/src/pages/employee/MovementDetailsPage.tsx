import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AreaManagerDecisionSummary } from '../../components/area-manager/AreaManagerDecisionSummary'
import { MovementOverview } from '../../components/movements/MovementOverview'
import { ErrorState, LoadingState } from '../../components/PageState'
import { SafetyReviewSummary } from '../../components/safety/SafetyReviewSummary'
import { StatusBadge } from '../../components/StatusBadge'
import { SupplyChainAssignmentSummary } from '../../components/supply-chain/SupplyChainAssignmentSummary'
import {
  fetchDrivers,
  fetchGpsDevices,
  fetchVehicles,
  getEmployees,
  getMovement,
} from '../../services/api'
import type { Driver, Employee, GPSDevice, Movement, Vehicle } from '../../types'
import { isAfterLocalCutoff } from '../../utils/movement'

export function MovementDetailsPage() {
  const { id = '' } = useParams()
  const [movement, setMovement] = useState<Movement | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [gpsDevices, setGpsDevices] = useState<GPSDevice[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      getMovement(id),
      getEmployees(),
      fetchGpsDevices(),
      fetchVehicles(),
      fetchDrivers(),
    ])
      .then(([movementData, employeeData, gpsData, vehicleData, driverData]) => {
        if (isCurrent) {
          setMovement(movementData)
          setEmployees(employeeData)
          setGpsDevices(gpsData)
          setVehicles(vehicleData)
          setDrivers(driverData)
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load movement.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [id])

  if (isLoading) return <LoadingState />
  if (error || !movement) {
    return <ErrorState title="Movement request could not be loaded" message={error} />
  }

  const canEdit = movement.status === 'PENDING_SAFETY' &&
    !movement.safetyReview.decision &&
    !movement.safetyReview.reviewedAt &&
    !isAfterLocalCutoff(movement.movementDate)

  return (
    <div className="employee-page details-page">
      <div className="page-heading details-heading">
        <div>
          <Link className="back-link" to="/employee">&lt;- My Requests</Link>
          <p className="page-eyebrow">{movement.id}</p>
          <h2>{movement.purpose}</h2>
        </div>
        <div className="details-heading-actions">
          {canEdit && (
            <Link
              className="button button-primary employee-edit-icon"
              to={`/employee/movements/${movement.id}/edit`}
              aria-label="Edit movement request"
              title="Edit movement request"
            >
              <span aria-hidden="true">&#9998;</span>
              <span className="visually-hidden">Edit Request</span>
            </Link>
          )}
          <StatusBadge status={movement.status} />
        </div>
      </div>

      <MovementOverview movement={movement} employees={employees} />

      {movement.safetyReview.decision && (
        <section className="details-section employee-safety-result" aria-labelledby="employee-safety-title">
          <h3 id="employee-safety-title">Safety decision</h3>
          <SafetyReviewSummary
            movement={movement}
            employees={employees}
            gpsDevices={gpsDevices}
          />
        </section>
      )}

      {movement.supplyChainAssignment.assignedAt && (
        <section className="details-section" aria-labelledby="employee-assignment-title">
          <h3 id="employee-assignment-title">Vehicle and driver assignment</h3>
          <SupplyChainAssignmentSummary
            movement={movement}
            employees={employees}
            vehicles={vehicles}
            drivers={drivers}
          />
        </section>
      )}

      {movement.areaManagerApproval.decision && (
        <section className="details-section" aria-labelledby="employee-area-manager-title">
          <h3 id="employee-area-manager-title">Area Manager decision</h3>
          <AreaManagerDecisionSummary movement={movement} employees={employees} />
        </section>
      )}
    </div>
  )
}
