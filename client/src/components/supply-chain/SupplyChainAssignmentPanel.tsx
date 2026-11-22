import { useState } from 'react'
import { CURRENT_SUPPLY_CHAIN_USER_ID } from '../../data/supplyChainUser'
import { ApiRequestError, submitSupplyChainAssignment } from '../../services/api'
import type { Driver, Employee, Movement, Vehicle } from '../../types'
import { SupplyChainAssignmentSummary } from './SupplyChainAssignmentSummary'

interface SupplyChainAssignmentPanelProps {
  movement: Movement
  employees: Employee[]
  vehicles: Vehicle[]
  drivers: Driver[]
  onAssigned: (movement: Movement) => void
}

export function SupplyChainAssignmentPanel({
  movement,
  employees,
  vehicles,
  drivers,
  onAssigned,
}: SupplyChainAssignmentPanelProps) {
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requestError, setRequestError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (movement.status !== 'SAFETY_APPROVED') {
    return (
      <section className="details-section assignment-panel" aria-labelledby="assignment-title">
        <h3 id="assignment-title">Supply Chain assignment</h3>
        {successMessage && <div className="form-success" role="status">{successMessage}</div>}
        <SupplyChainAssignmentSummary
          movement={movement}
          employees={employees}
          vehicles={vehicles}
          drivers={drivers}
        />
      </section>
    )
  }

  async function handleSubmit() {
    const nextErrors: Record<string, string> = {}
    if (!vehicleId) nextErrors.vehicleId = 'Select an active vehicle.'
    if (!driverId) nextErrors.driverId = 'Select an active driver.'
    setErrors(nextErrors)
    setRequestError('')

    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const assignedMovement = await submitSupplyChainAssignment(movement.id, {
        assignedBy: CURRENT_SUPPLY_CHAIN_USER_ID,
        vehicleId,
        driverId,
        comment: comment.trim() || undefined,
      })
      setSuccessMessage('Vehicle and driver assigned successfully.')
      onAssigned(assignedMovement)
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(
          Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])),
        )
        setRequestError(error.message)
      } else {
        setRequestError('The vehicle and driver assignment could not be saved.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="details-section assignment-panel" aria-labelledby="assignment-title">
      <h3 id="assignment-title">Supply Chain assignment</h3>
      <p className="section-hint">Assign one active vehicle and one active driver.</p>

      {requestError && <div className="form-alert" role="alert">{requestError}</div>}

      <div className="assignment-form-grid">
        <div className="field-group">
          <label htmlFor="assignment-vehicle">Vehicle</label>
          <select
            id="assignment-vehicle"
            value={vehicleId}
            onChange={(event) => {
              setVehicleId(event.target.value)
              setErrors({})
            }}
            aria-invalid={Boolean(errors.vehicleId)}
          >
            <option value="">Select an active vehicle</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.code} - {vehicle.plateNumber} - {vehicle.description}
              </option>
            ))}
          </select>
          {errors.vehicleId && <p className="field-error">{errors.vehicleId}</p>}
        </div>

        <div className="field-group">
          <label htmlFor="assignment-driver">Driver</label>
          <select
            id="assignment-driver"
            value={driverId}
            onChange={(event) => {
              setDriverId(event.target.value)
              setErrors({})
            }}
            aria-invalid={Boolean(errors.driverId)}
          >
            <option value="">Select an active driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}{driver.phone ? ` - ${driver.phone}` : ''}
              </option>
            ))}
          </select>
          {errors.driverId && <p className="field-error">{errors.driverId}</p>}
        </div>

        <div className="field-group assignment-comment">
          <label htmlFor="assignment-comment">Supply Chain Comment</label>
          <textarea
            id="assignment-comment"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional assignment comment"
          />
        </div>
      </div>

      <div className="review-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Assigning...' : 'Assign Vehicle and Driver'}
        </button>
      </div>
    </section>
  )
}

