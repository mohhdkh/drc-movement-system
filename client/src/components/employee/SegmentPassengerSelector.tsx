import { useMemo, useState } from 'react'
import type { Employee } from '../../types'
import { getSegmentCode } from '../../utils/movement'
import { EmployeeSelectionDialog } from './EmployeeSelectionDialog'

const MAX_PASSENGERS = 7

interface PassengerSlotProps {
  employee?: Employee
  employees: Employee[]
  selectedIds: string[]
  isLeader: boolean
  vehicleLeaderId: string
  label: string
  onSelect: (employeeId: string) => void
  onRemove: () => void
}

function PassengerSlot({ employee, employees, selectedIds, isLeader, vehicleLeaderId, label, onSelect, onRemove }: PassengerSlotProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (employee && !isOpen) {
    return (
      <div className="passenger-slot">
        <button type="button" className={`passenger-selection-field${isLeader ? ' passenger-selection-field-leader' : ''}`} onClick={() => setIsOpen(true)} aria-label={`Change ${label}`}>
          <strong>{employee.displayName}</strong>{isLeader && <small>Vehicle Leader</small>}
        </button>
      </div>
    )
  }

  return (
    <div className="passenger-slot">
      <button type="button" className="passenger-selection-field" onClick={() => setIsOpen(true)} aria-label={label}>
        {employee?.displayName ?? 'Select employee...'}
      </button>
      <EmployeeSelectionDialog
        key={isOpen ? 'open' : 'closed'}
        isOpen={isOpen}
        title={employee ? `Change ${label}` : label}
        employees={employees}
        selectedEmployeeId={employee?.id}
        excludedEmployeeIds={selectedIds}
        vehicleLeaderId={vehicleLeaderId}
        allowClear={Boolean(employee) && !isLeader}
        onSelect={(employeeId) => { onSelect(employeeId); setIsOpen(false) }}
        onClear={() => { onRemove(); setIsOpen(false) }}
        onClose={() => setIsOpen(false)}
      />
    </div>
  )
}

interface SegmentPassengerSelectorProps {
  employees: Employee[]
  startLocation: string
  stops: string[]
  passengerIdsBySegment: string[][]
  vehicleLeaderId: string
  errors: Record<string, string>
  onSetPassenger: (segmentIndex: number, slotIndex: number, employeeId: string) => void
  onRemovePassenger: (segmentIndex: number, slotIndex: number) => void
}

export function SegmentPassengerSelector({
  employees,
  startLocation,
  stops,
  passengerIdsBySegment,
  vehicleLeaderId,
  errors,
  onSetPassenger,
  onRemovePassenger,
}: SegmentPassengerSelectorProps) {
  const points = [startLocation, ...stops]
  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])

  return (
    <fieldset className="form-section">
      <legend>Passengers by segment</legend>
      <p className="section-hint">Search for up to seven passengers on each segment. A newly added segment inherits the previous segment.</p>

      <div className="segment-grid">
        {stops.map((_, segmentIndex) => {
          const errorKey = `segments.${segmentIndex}.passengerIds`
          const selectedIds = passengerIdsBySegment[segmentIndex] ?? []
          return (
            <article className="segment-card" key={segmentIndex}>
              <div className="segment-heading">
                <span className="segment-code">{getSegmentCode(segmentIndex + 1)}</span>
                <h3>{points[segmentIndex].trim() || 'Start'}<span aria-hidden="true"> -&gt; </span>{points[segmentIndex + 1].trim() || `Stop ${segmentIndex + 1}`}</h3>
              </div>

              <div className="passenger-slots">
                {Array.from({ length: MAX_PASSENGERS }, (_, slotIndex) => {
                  const employeeId = selectedIds[slotIndex]
                  return (
                    <PassengerSlot
                      key={slotIndex}
                      employee={employeeId ? employeesById.get(employeeId) : undefined}
                      employees={employees}
                      selectedIds={selectedIds}
                      isLeader={employeeId === vehicleLeaderId}
                      vehicleLeaderId={vehicleLeaderId}
                      label={`${getSegmentCode(segmentIndex + 1)} passenger ${slotIndex + 1}`}
                      onSelect={(id) => onSetPassenger(segmentIndex, slotIndex, id)}
                      onRemove={() => onRemovePassenger(segmentIndex, slotIndex)}
                    />
                  )
                })}
              </div>
              {errors[errorKey] && <p className="field-error">{errors[errorKey]}</p>}
            </article>
          )
        })}
      </div>
    </fieldset>
  )
}
