import { useEffect, useMemo, useRef, useState } from 'react'
import type { Employee } from '../../types'

interface EmployeeSelectionDialogProps {
  isOpen: boolean
  title: string
  employees: Employee[]
  selectedEmployeeId?: string
  excludedEmployeeIds?: string[]
  vehicleLeaderId?: string
  allowClear?: boolean
  onSelect: (employeeId: string) => void
  onClear?: () => void
  onClose: () => void
}

export function EmployeeSelectionDialog({
  isOpen,
  title,
  employees,
  selectedEmployeeId,
  excludedEmployeeIds = [],
  vehicleLeaderId,
  allowClear = false,
  onSelect,
  onClear,
  onClose,
}: EmployeeSelectionDialogProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const excludedIds = useMemo(() => new Set(excludedEmployeeIds), [excludedEmployeeIds])
  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return []
    return employees.filter((employee) => {
      if (employee.id !== selectedEmployeeId && excludedIds.has(employee.id)) return false
      return !normalizedQuery || employee.displayName.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [employees, excludedIds, query, selectedEmployeeId])

  useEffect(() => {
    if (!isOpen) return
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="employee-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="employee-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title">
        <div className="employee-dialog-heading">
          <h2 id="employee-dialog-title">{title}</h2>
          <button type="button" className="button button-quiet" onClick={onClose} aria-label="Close employee selection">Close</button>
        </div>
        <label className="visually-hidden" htmlFor="employee-dialog-search">Search employee</label>
        <input
          ref={searchRef}
          id="employee-dialog-search"
          className="employee-dialog-search"
          value={query}
          placeholder="Search employee..."
          onChange={(event) => setQuery(event.target.value)}
        />
        {selectedEmployeeId && (
          <p className="employee-dialog-current">
            Current selection: {employees.find((employee) => employee.id === selectedEmployeeId)?.displayName ?? 'Unknown employee'}
          </p>
        )}
        <div className="employee-dialog-list" role="listbox" aria-label="Employees">
          {!query.trim() ? <p className="employee-dialog-empty">Type to search employees</p> : filteredEmployees.length === 0 ? <p className="employee-dialog-empty">No matching employees</p> : filteredEmployees.map((employee) => (
            <button
              type="button"
              role="option"
              aria-selected={employee.id === selectedEmployeeId}
              className="employee-dialog-option"
              key={employee.id}
              onClick={() => onSelect(employee.id)}
            >
              <input type="checkbox" checked={employee.id === selectedEmployeeId} readOnly tabIndex={-1} aria-hidden="true" />
              <span className="employee-dialog-option-details">
                <strong>{employee.displayName}</strong>
                {employee.id === vehicleLeaderId && <small>Vehicle Leader</small>}
              </span>
            </button>
          ))}
        </div>
        {allowClear && selectedEmployeeId && onClear && (
          <button type="button" className="button button-secondary employee-dialog-clear" onClick={onClear}>Clear selection</button>
        )}
      </section>
    </div>
  )
}
