import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AreaManagerDecisionSummary } from '../../components/area-manager/AreaManagerDecisionSummary'
import { MovementOverview } from '../../components/movements/MovementOverview'
import { ErrorState, LoadingState } from '../../components/PageState'
import { SafetyReviewPanel } from '../../components/safety/SafetyReviewPanel'
import { StatusBadge } from '../../components/StatusBadge'
import { SupplyChainAssignmentSummary } from '../../components/supply-chain/SupplyChainAssignmentSummary'
import {
  fetchDrivers,
  fetchGpsDevices,
  fetchSafetyMovement,
  fetchVehicles,
  getEmployees,
} from '../../services/api'
import type { Driver, Employee, GPSDevice, Movement, Vehicle } from '../../types'

export function SafetyMovementReviewPage() {
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
      fetchSafetyMovement(id),
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
    return (
      <ErrorState
        title="Safety movement could not be loaded"
        message={error}
        action={<Link className="button button-secondary" to="/safety">Back to Safety Queue</Link>}
      />
    )
  }

  return (
    <div className="employee-page details-page safety-review-page">
      <div className="page-heading details-heading">
        <div>
          <Link className="back-link" to="/safety">&lt;- Safety Queue</Link>
          <p className="page-eyebrow">{movement.id}</p>
          <h2>{movement.purpose}</h2>
        </div>
        <StatusBadge status={movement.status} />
      </div>

      <MovementOverview movement={movement} employees={employees} showRequester />
      <SafetyReviewPanel
        movement={movement}
        employees={employees}
        gpsDevices={gpsDevices}
        onReviewed={setMovement}
      />
      {movement.supplyChainAssignment.assignedAt && (
        <section className="details-section" aria-labelledby="safety-assignment-title">
          <h3 id="safety-assignment-title">Vehicle and driver assignment</h3>
          <SupplyChainAssignmentSummary
            movement={movement}
            employees={employees}
            vehicles={vehicles}
            drivers={drivers}
          />
        </section>
      )}

      {movement.areaManagerApproval.decision && (
        <section className="details-section" aria-labelledby="safety-area-manager-title">
          <h3 id="safety-area-manager-title">Area Manager decision</h3>
          <AreaManagerDecisionSummary movement={movement} employees={employees} />
        </section>
      )}
    </div>
  )
}
