import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AreaManagerDecisionSummary } from '../../components/area-manager/AreaManagerDecisionSummary'
import { MovementOverview } from '../../components/movements/MovementOverview'
import { ErrorState, LoadingState } from '../../components/PageState'
import { SafetyReviewSummary } from '../../components/safety/SafetyReviewSummary'
import { StatusBadge } from '../../components/StatusBadge'
import { SupplyChainAssignmentPanel } from '../../components/supply-chain/SupplyChainAssignmentPanel'
import {
  fetchDrivers,
  fetchGpsDevices,
  fetchSupplyChainMovement,
  fetchVehicles,
  getEmployees,
} from '../../services/api'
import type { Driver, Employee, GPSDevice, Movement, Vehicle } from '../../types'

export function SupplyChainMovementPage() {
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
      fetchSupplyChainMovement(id),
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
        title="Supply Chain movement could not be loaded"
        message={error}
        action={<Link className="button button-secondary" to="/supply-chain">Back to Assignment Queue</Link>}
      />
    )
  }

  return (
    <div className="employee-page details-page supply-assignment-page">
      <div className="page-heading details-heading">
        <div>
          <Link className="back-link" to="/supply-chain">&lt;- Assignment Queue</Link>
          <p className="page-eyebrow">{movement.id}</p>
          <h2>{movement.purpose}</h2>
        </div>
        <StatusBadge status={movement.status} />
      </div>

      <MovementOverview movement={movement} employees={employees} showRequester />

      <section className="details-section" aria-labelledby="supply-safety-title">
        <h3 id="supply-safety-title">Safety decision</h3>
        <SafetyReviewSummary
          movement={movement}
          employees={employees}
          gpsDevices={gpsDevices}
        />
      </section>

      <SupplyChainAssignmentPanel
        movement={movement}
        employees={employees}
        vehicles={vehicles}
        drivers={drivers}
        onAssigned={setMovement}
      />

      {movement.areaManagerApproval.decision && (
        <section className="details-section" aria-labelledby="supply-area-manager-title">
          <h3 id="supply-area-manager-title">Area Manager decision</h3>
          <AreaManagerDecisionSummary movement={movement} employees={employees} />
        </section>
      )}
    </div>
  )
}
