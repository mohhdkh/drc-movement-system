import { useMemo } from 'react'
import type { Employee, Movement } from '../../types'
import { formatDate } from '../../utils/movement'

interface MovementOverviewProps {
  movement: Movement
  employees: Employee[]
  showRequester?: boolean
}

export function MovementOverview({
  movement,
  employees,
  showRequester = false,
}: MovementOverviewProps) {
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.displayName])),
    [employees],
  )

  return (
    <>
      <section className="details-section" aria-labelledby="movement-summary-title">
        <h3 id="movement-summary-title">Movement summary</h3>
        <dl className="details-grid">
          <div><dt>Movement ID</dt><dd>{movement.id}</dd></div>
          {showRequester && (
            <div><dt>Requester</dt><dd>{employeeNames.get(movement.requesterId) ?? 'Unknown employee'}</dd></div>
          )}
          <div><dt>Date</dt><dd>{formatDate(movement.movementDate)}</dd></div>
          <div><dt>ETD</dt><dd>{movement.etd}</dd></div>
          <div><dt>ETA</dt><dd>{movement.eta}</dd></div>
          <div><dt>Start Location</dt><dd>{movement.startLocation}</dd></div>
          <div><dt>Vehicle Leader</dt><dd>{employeeNames.get(movement.vehicleLeaderId) ?? 'Unknown employee'}</dd></div>
          <div className="details-wide"><dt>Notes</dt><dd>{movement.notes || 'No notes provided.'}</dd></div>
        </dl>
      </section>

      <section className="details-section" aria-labelledby="movement-route-title">
        <h3 id="movement-route-title">Route</h3>
        <ol className="detail-route">
          <li>
            <span className="route-point-index">1</span>
            <span className="route-point-content">{movement.startLocation}</span>
          </li>
          {movement.routePoints.map((point, index) => {
            const segment = movement.segments[index]

            return (
              <li key={`${point}-${index}`}>
                <span className="route-point-index">{index + 2}</span>
                <span className="route-point-content">
                  <span>{point}</span>
                  <span className="route-point-times">
                    Arrival {segment?.arrivalTime || 'Not recorded'}
                    <span aria-hidden="true"> | </span>
                    Departure {segment?.departureTime || 'Not recorded'}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="details-section" aria-labelledby="movement-segments-title">
        <h3 id="movement-segments-title">Segments</h3>
        <div className="segment-grid detail-segments">
          {movement.segments.map((segment) => (
            <article className="segment-card" key={segment.id}>
              <div className="segment-heading">
                <span className="segment-code">{segment.code}</span>
                <h4>{segment.fromLocation} <span aria-hidden="true">-&gt;</span> {segment.toLocation}</h4>
              </div>
              <p className="passenger-count">{segment.passengerIds.length} passenger{segment.passengerIds.length === 1 ? '' : 's'}</p>
              <ul className="passenger-list">
                {segment.passengerIds.map((passengerId) => (
                  <li key={passengerId}>
                    {employeeNames.get(passengerId) ?? 'Unknown employee'}
                    {passengerId === movement.vehicleLeaderId && <small>Vehicle Leader</small>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
