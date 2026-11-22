import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/PageState'
import { StatusBadge } from '../../components/StatusBadge'
import {
  fetchAreaManagerMovements,
  fetchDrivers,
  fetchGpsDevices,
  fetchVehicles,
  getEmployees,
} from '../../services/api'
import type { Driver, Employee, GPSDevice, Movement, Vehicle } from '../../types'
import { formatDate } from '../../utils/movement'

function getGpsLabel(movement: Movement, gpsDevices: GPSDevice[]) {
  if (movement.gpsAssignment.type === 'NO_GPS') return 'No GPS Required'
  if (movement.gpsAssignment.type !== 'DEVICE') return 'Not assigned'
  return gpsDevices.find((device) => device.id === movement.gpsAssignment.gpsDeviceId)?.code
    ?? movement.gpsAssignment.gpsDeviceId
    ?? 'Unknown device'
}

export function AreaManagerPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [gpsDevices, setGpsDevices] = useState<GPSDevice[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isCurrent = true
    Promise.all([
      fetchAreaManagerMovements(),
      getEmployees(),
      fetchGpsDevices(),
      fetchVehicles(),
      fetchDrivers(),
    ])
      .then(([movementData, employeeData, gpsData, vehicleData, driverData]) => {
        if (isCurrent) {
          setMovements(movementData)
          setEmployees(employeeData)
          setGpsDevices(gpsData)
          setVehicles(vehicleData)
          setDrivers(driverData)
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load final approvals.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [reloadKey])

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.displayName])),
    [employees],
  )
  const vehicleLabels = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, `${vehicle.code} - ${vehicle.plateNumber}`])),
    [vehicles],
  )
  const driverNames = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver.name])),
    [drivers],
  )
  const counts = useMemo(() => ({
    awaiting: movements.filter((movement) => movement.status === 'VEHICLE_ASSIGNED').length,
    approved: movements.filter((movement) => movement.status === 'FINAL_APPROVED').length,
    rejected: movements.filter((movement) => movement.status === 'FINAL_REJECTED').length,
    reviewed: movements.filter((movement) => (
      movement.status === 'FINAL_APPROVED' || movement.status === 'FINAL_REJECTED'
    )).length,
  }), [movements])

  function retryLoad() {
    setIsLoading(true)
    setError('')
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="employee-page area-manager-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Area Manager workspace</p>
          <h2>Final Movement Approvals</h2>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          title="Final approval queue could not be loaded"
          message={error}
          action={<button type="button" className="button button-secondary" onClick={retryLoad}>Try Again</button>}
        />
      ) : (
        <>
          <section className="safety-summary" aria-label="Area Manager review summary">
            <article className="summary-stat summary-area-awaiting"><span>Awaiting Final Approval</span><strong>{counts.awaiting}</strong></article>
            <article className="summary-stat summary-area-approved"><span>Final Approved</span><strong>{counts.approved}</strong></article>
            <article className="summary-stat summary-area-rejected"><span>Final Rejected</span><strong>{counts.rejected}</strong></article>
            <article className="summary-stat summary-area-reviewed"><span>Total Reviewed</span><strong>{counts.reviewed}</strong></article>
          </section>

          {movements.length === 0 ? (
            <div className="empty-state">
              <h3>No movements awaiting final approval</h3>
              <p>Vehicle-assigned movements will appear here.</p>
            </div>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table area-manager-table">
                <thead>
                  <tr>
                    <th scope="col">Movement</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date / Time</th>
                    <th scope="col">Vehicle Leader</th>
                    <th scope="col">Safety / GPS</th>
                    <th scope="col">Vehicle</th>
                    <th scope="col">Driver</th>
                    <th scope="col"><span className="visually-hidden">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td data-label="Movement">
                        <span className="request-link static-request"><strong>{movement.purpose}</strong><span>{movement.id}</span></span>
                      </td>
                      <td data-label="Status"><StatusBadge status={movement.status} /></td>
                      <td data-label="Date / Time">{formatDate(movement.movementDate)}<small>{movement.etd} / {movement.eta}</small></td>
                      <td data-label="Vehicle Leader">{employeeNames.get(movement.vehicleLeaderId) ?? 'Unknown employee'}</td>
                      <td data-label="Safety / GPS">{movement.safetyReview.decision ?? 'Not reviewed'}<small>{getGpsLabel(movement, gpsDevices)}</small></td>
                      <td data-label="Vehicle">{movement.supplyChainAssignment.vehicleId ? vehicleLabels.get(movement.supplyChainAssignment.vehicleId) ?? movement.supplyChainAssignment.vehicleId : 'Not assigned'}</td>
                      <td data-label="Driver">{movement.supplyChainAssignment.driverId ? driverNames.get(movement.supplyChainAssignment.driverId) ?? movement.supplyChainAssignment.driverId : 'Not assigned'}</td>
                      <td data-label="Action">
                        <Link className="button button-secondary button-small" to={`/area-manager/movements/${movement.id}`}>
                          {movement.status === 'VEHICLE_ASSIGNED' ? 'Review' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
