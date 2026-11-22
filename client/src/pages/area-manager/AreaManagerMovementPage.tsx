import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AreaManagerReviewPanel } from '../../components/area-manager/AreaManagerReviewPanel'
import { MovementOverview } from '../../components/movements/MovementOverview'
import { ErrorState, LoadingState } from '../../components/PageState'
import { SafetyReviewSummary } from '../../components/safety/SafetyReviewSummary'
import { StatusBadge } from '../../components/StatusBadge'
import { SupplyChainAssignmentSummary } from '../../components/supply-chain/SupplyChainAssignmentSummary'
import {
  fetchAreaManagerMovement,
  fetchDrivers,
  fetchGpsDevices,
  fetchVehicles,
  getEmployees,
} from '../../services/api'
import type { Driver, Employee, GPSDevice, Movement, Vehicle } from '../../types'

export function AreaManagerMovementPage() {
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
      fetchAreaManagerMovement(id),
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
        title="Area Manager movement could not be loaded"
        message={error}
        action={<Link className="button button-secondary" to="/area-manager">Back to Final Approval Queue</Link>}
      />
    )
  }

  return (
    <div className="employee-page details-page area-review-page">
      <div className="page-heading details-heading">
        <div>
          <Link className="back-link" to="/area-manager">&lt;- Final Approval Queue</Link>
          <p className="page-eyebrow">{movement.id}</p>
          <h2>{movement.purpose}</h2>
        </div>
        <StatusBadge status={movement.status} />
      </div>

      <MovementOverview movement={movement} employees={employees} showRequester />

      <section className="details-section" aria-labelledby="area-safety-title">
        <h3 id="area-safety-title">Safety decision</h3>
        <SafetyReviewSummary movement={movement} employees={employees} gpsDevices={gpsDevices} />
      </section>

      <section className="details-section" aria-labelledby="area-assignment-title">
        <h3 id="area-assignment-title">Vehicle and driver assignment</h3>
        <SupplyChainAssignmentSummary
          movement={movement}
          employees={employees}
          vehicles={vehicles}
          drivers={drivers}
        />
      </section>

      <AreaManagerReviewPanel
        movement={movement}
        employees={employees}
        onReviewed={setMovement}
      />
    </div>
  )
}
