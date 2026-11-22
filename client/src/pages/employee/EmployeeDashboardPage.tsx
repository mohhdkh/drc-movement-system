import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/PageState'
import { StatusBadge } from '../../components/StatusBadge'
import { CURRENT_USER_ID } from '../../data/currentUser'
import { getEmployees, getMovements } from '../../services/api'
import type { Employee, Movement } from '../../types'
import { formatDate } from '../../utils/movement'

export function EmployeeDashboardPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isCurrent = true

    Promise.all([getMovements(CURRENT_USER_ID), getEmployees()])
      .then(([movementData, employeeData]) => {
        if (isCurrent) {
          setMovements(movementData)
          setEmployees(employeeData)
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load requests.')
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

  function retryLoad() {
    setIsLoading(true)
    setError('')
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="employee-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Employee workspace</p>
          <h2>My Movement Requests</h2>
        </div>
        <Link className="button button-primary" to="/employee/movements/new">
          + New Movement Request
        </Link>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          title="Requests could not be loaded"
          message={error}
          action={
            <button className="button button-secondary" type="button" onClick={retryLoad}>
              Try Again
            </button>
          }
        />
      ) : movements.length === 0 ? (
        <div className="empty-state">
          <h3>No movement requests yet</h3>
          <p>Your submitted requests will appear here.</p>
          <Link className="button button-primary" to="/employee/movements/new">
            Create First Request
          </Link>
        </div>
      ) : (
        <div className="request-table-wrap">
          <table className="request-table">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Status</th>
                <th scope="col">Movement Date</th>
                <th scope="col">ETD / ETA</th>
                <th scope="col">Vehicle Leader</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td data-label="Request">
                    <Link className="request-link" to={`/employee/movements/${movement.id}`}>
                      <strong>{movement.purpose}</strong>
                      <span>{movement.id}</span>
                    </Link>
                  </td>
                  <td data-label="Status"><StatusBadge status={movement.status} /></td>
                  <td data-label="Movement Date">{formatDate(movement.movementDate)}</td>
                  <td data-label="ETD / ETA">{movement.etd} / {movement.eta}</td>
                  <td data-label="Vehicle Leader">
                    {employeeNames.get(movement.vehicleLeaderId) ?? 'Unknown employee'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
