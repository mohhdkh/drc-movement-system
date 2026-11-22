import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/PageState'
import { StatusBadge } from '../../components/StatusBadge'
import {
  fetchGpsDevices,
  fetchSupplyChainMovements,
  getEmployees,
} from '../../services/api'
import type { Employee, GPSDevice, Movement } from '../../types'
import { formatDate } from '../../utils/movement'

const downstreamStatuses = new Set([
  'SAFETY_APPROVED',
  'VEHICLE_ASSIGNED',
  'PENDING_AREA_MANAGER',
  'FINAL_APPROVED',
  'FINAL_REJECTED',
])

function getGpsLabel(movement: Movement, gpsDevices: GPSDevice[]) {
  if (movement.gpsAssignment.type === 'NO_GPS') return 'No GPS Required'
  if (movement.gpsAssignment.type !== 'DEVICE') return 'Not assigned'
  return gpsDevices.find((device) => device.id === movement.gpsAssignment.gpsDeviceId)?.code
    ?? movement.gpsAssignment.gpsDeviceId
    ?? 'Unknown device'
}

export function SupplyChainDashboardPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [gpsDevices, setGpsDevices] = useState<GPSDevice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isCurrent = true
    Promise.all([fetchSupplyChainMovements(), getEmployees(), fetchGpsDevices()])
      .then(([movementData, employeeData, gpsData]) => {
        if (isCurrent) {
          setMovements(movementData)
          setEmployees(employeeData)
          setGpsDevices(gpsData)
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load assignments.')
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
  const counts = useMemo(() => ({
    awaiting: movements.filter((movement) => movement.status === 'SAFETY_APPROVED').length,
    assigned: movements.filter((movement) => movement.status === 'VEHICLE_ASSIGNED').length,
    pendingManager: movements.filter((movement) => movement.status === 'PENDING_AREA_MANAGER').length,
    safetyApproved: movements.filter((movement) => downstreamStatuses.has(movement.status)).length,
  }), [movements])

  function retryLoad() {
    setIsLoading(true)
    setError('')
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="employee-page supply-chain-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Supply Chain workspace</p>
          <h2>Vehicle and Driver Assignments</h2>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          title="Assignment queue could not be loaded"
          message={error}
          action={<button type="button" className="button button-secondary" onClick={retryLoad}>Try Again</button>}
        />
      ) : (
        <>
          <section className="safety-summary" aria-label="Supply Chain assignment summary">
            <article className="summary-stat summary-supply-awaiting"><span>Awaiting Assignment</span><strong>{counts.awaiting}</strong></article>
            <article className="summary-stat summary-supply-assigned"><span>Vehicle Assigned</span><strong>{counts.assigned}</strong></article>
            <article className="summary-stat summary-supply-manager"><span>Pending Area Manager</span><strong>{counts.pendingManager}</strong></article>
            <article className="summary-stat summary-supply-total"><span>Total Safety Approved</span><strong>{counts.safetyApproved}</strong></article>
          </section>

          {movements.length === 0 ? (
            <div className="empty-state">
              <h3>No movements awaiting Supply Chain</h3>
              <p>Safety-approved movements will appear here.</p>
            </div>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table supply-table">
                <thead>
                  <tr>
                    <th scope="col">Movement</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date / Time</th>
                    <th scope="col">Requester</th>
                    <th scope="col">Vehicle Leader</th>
                    <th scope="col">Segments</th>
                    <th scope="col">GPS</th>
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
                      <td data-label="Requester">{employeeNames.get(movement.requesterId) ?? 'Unknown employee'}</td>
                      <td data-label="Vehicle Leader">{employeeNames.get(movement.vehicleLeaderId) ?? 'Unknown employee'}</td>
                      <td data-label="Segments">{movement.segments.length}</td>
                      <td data-label="GPS">{getGpsLabel(movement, gpsDevices)}</td>
                      <td data-label="Action">
                        <Link className="button button-secondary button-small" to={`/supply-chain/movements/${movement.id}`}>
                          {movement.status === 'SAFETY_APPROVED' ? 'Assign Vehicle' : 'View'}
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
