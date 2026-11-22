import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/PageState'
import {
  RouteBuilder,
  type RouteStopValue,
} from '../../components/employee/RouteBuilder'
import { SegmentPassengerSelector } from '../../components/employee/SegmentPassengerSelector'
import { CURRENT_USER_ID } from '../../data/currentUser'
import { ApiRequestError, createMovement, getEmployees, getLocations, getMovement, updateMovement } from '../../services/api'
import type { CreateMovementInput, Employee, Location } from '../../types'
import {
  type FormErrors,
  getCurrentMovementDate,
  isAfterLocalCutoff,
  validateMovementInput,
} from '../../utils/movement'
import { inheritPassengers, removePassengerFromSlot, setPassengerInSlot } from '../../utils/passengerSelection'

interface MovementFormState {
  movementDate: string
  purpose: string
  startLocation: string
  startLocationId: string
  startDepartureTime: string
  notes: string
  vehicleLeaderId: string
}

const initialForm: MovementFormState = {
  movementDate: '',
  purpose: '',
  startLocation: '',
  startLocationId: '',
  startDepartureTime: '',
  notes: '',
  vehicleLeaderId: '',
}

const emptyStop = (): RouteStopValue => ({
  location: '',
  locationId: '',
  latitude: null,
  longitude: null,
  arrivalTime: '',
  departureTime: '',
})

export function NewMovementPage() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [form, setForm] = useState(initialForm)
  const [stops, setStops] = useState<RouteStopValue[]>([emptyStop()])
  const [passengerIdsBySegment, setPassengerIdsBySegment] = useState<string[][]>([[]])
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let isCurrent = true
    Promise.all([getEmployees(), getLocations(), id ? getMovement(id) : Promise.resolve(null)])
      .then(([employeeData, locationData, movement]) => {
        if (isCurrent) {
          setEmployees(employeeData)
          setLocations(locationData)
          if (movement) {
            if (
              movement.status !== 'PENDING_SAFETY' ||
              movement.safetyReview.decision ||
              movement.safetyReview.reviewedAt ||
              isAfterLocalCutoff(movement.movementDate)
            ) {
              setLoadError('This movement request can no longer be edited.')
              return
            }
            setForm({
              movementDate: movement.movementDate,
              purpose: movement.purpose,
              startLocation: movement.startLocation,
              startLocationId: locationData.find((location) => location.name === movement.startLocation)?.id ?? '',
              startDepartureTime: movement.etd,
              notes: movement.notes ?? '',
              vehicleLeaderId: movement.vehicleLeaderId,
            })
            setStops(movement.segments.map((segment, index) => ({
              location: segment.toLocation,
              locationId: segment.toLocationId ?? locationData.find((location) => location.name === segment.toLocation)?.id ?? '',
              latitude: segment.toLatitude ?? null,
              longitude: segment.toLongitude ?? null,
              arrivalTime: segment.arrivalTime ?? '',
              departureTime: movement.segments[index + 1]?.departureTime ?? '',
            })))
            setPassengerIdsBySegment(movement.segments.map((segment) => [...segment.passengerIds]))
          }
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load employees.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [id])

  function updateForm(field: keyof MovementFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors({})
    setSubmitError('')
  }

  function updateLeader(value: string) {
    updateForm('vehicleLeaderId', value)
    if (value) {
      setPassengerIdsBySegment((segments) =>
        segments.map((ids) => (ids.includes(value) ? ids : [value, ...ids].slice(0, 7))),
      )
    }
  }

  function updateStop(index: number, field: keyof RouteStopValue, value: string) {
    setStops((current) => current.map((stop, stopIndex) => (
      stopIndex === index ? { ...stop, [field]: value } : stop
    )))
    setErrors({})
    setSubmitError('')
  }

  function selectStartLocation(location: Location) {
    setForm((current) => ({ ...current, startLocation: location.name, startLocationId: location.id }))
    setErrors({})
    setSubmitError('')
  }

  function selectStopLocation(index: number, location: Location) {
    setStops((current) => current.map((stop, stopIndex) => stopIndex === index
      ? { ...stop, location: location.name, locationId: location.id, latitude: location.latitude, longitude: location.longitude }
      : stop))
    setErrors({})
    setSubmitError('')
  }

  function addStop() {
    setStops((current) => [...current, emptyStop()])
    setPassengerIdsBySegment((current) => [...current, inheritPassengers(current, form.vehicleLeaderId)])
  }

  function removeStop(index: number) {
    if (stops.length === 1) return
    setStops((current) => current.filter((_, stopIndex) => stopIndex !== index))
    setPassengerIdsBySegment((current) =>
      current.filter((_, segmentIndex) => segmentIndex !== index),
    )
    setErrors({})
  }

  function setPassenger(segmentIndex: number, slotIndex: number, employeeId: string) {
    setPassengerIdsBySegment((current) => setPassengerInSlot(current, segmentIndex, slotIndex, employeeId))
    setErrors({})
  }

  function removePassenger(segmentIndex: number, slotIndex: number) {
    setPassengerIdsBySegment((current) => removePassengerFromSlot(current, segmentIndex, slotIndex))
    setErrors({})
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input: CreateMovementInput = {
      requesterId: CURRENT_USER_ID,
      ...form,
      startLocationId: form.startLocationId,
      startDepartureTime: form.startDepartureTime,
      routePoints: stops.map((stop) => stop.location),
      routePointLocationIds: stops.map((stop) => stop.locationId),
      segments: passengerIdsBySegment.map((passengerIds, index) => ({
        passengerIds: passengerIds.filter(Boolean),
        arrivalTime: stops[index].arrivalTime,
        departureTime: index === 0 ? form.startDepartureTime : stops[index - 1].departureTime,
      })),
    }
    const validationErrors = validateMovementInput(input)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setSubmitError('Review the highlighted fields before submitting.')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    try {
      const movement = isEditing && id
        ? await updateMovement(id, input)
        : await createMovement(input)
      navigate(`/employee/movements/${movement.id}`)
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(
          Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])),
        )
        setSubmitError(error.message)
      } else {
        setSubmitError('The movement request could not be submitted.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <LoadingState />

  if (loadError) {
    return <ErrorState title="The form could not be loaded" message={loadError} />
  }

  return (
    <div className="employee-page form-page">
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/employee">&lt;- My Requests</Link>
          <h2>{isEditing ? 'Edit Movement Request' : 'New Movement Request'}</h2>
        </div>
      </div>

      <form className="movement-form" onSubmit={handleSubmit} noValidate>
        {submitError && <div className="form-alert" role="alert">{submitError}</div>}

        <fieldset className="form-section">
          <legend>Movement details</legend>
          <div className="form-grid">
            <div className="field-group">
              <label htmlFor="movement-date">Movement Date</label>
              <input
                id="movement-date"
                type="date"
                min={getCurrentMovementDate()}
                value={form.movementDate}
                onChange={(event) => updateForm('movementDate', event.target.value)}
                aria-invalid={Boolean(errors.movementDate)}
              />
              {errors.movementDate && <p className="field-error">{errors.movementDate}</p>}
            </div>

            <div className="field-group field-span-two">
              <label htmlFor="purpose">Purpose</label>
              <input
                id="purpose"
                value={form.purpose}
                onChange={(event) => updateForm('purpose', event.target.value)}
                placeholder="Reason for movement"
                aria-invalid={Boolean(errors.purpose)}
              />
              {errors.purpose && <p className="field-error">{errors.purpose}</p>}
            </div>

            <div className="field-group">
              <label htmlFor="calculated-etd">Calculated ETD</label>
              <input id="calculated-etd" value={form.startDepartureTime || 'Set start departure'} readOnly />
            </div>

            <div className="field-group">
              <label htmlFor="calculated-eta">Calculated ETA</label>
              <input id="calculated-eta" value={stops.at(-1)?.arrivalTime || 'Set final arrival'} readOnly />
            </div>

            <div className="field-group">
              <label htmlFor="vehicle-leader">Vehicle Leader</label>
              <select
                id="vehicle-leader"
                value={form.vehicleLeaderId}
                onChange={(event) => updateLeader(event.target.value)}
                aria-invalid={Boolean(errors.vehicleLeaderId)}
              >
                <option value="">Select an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.displayName}</option>
                ))}
              </select>
              {errors.vehicleLeaderId && <p className="field-error">{errors.vehicleLeaderId}</p>}
            </div>

            <div className="field-group field-span-three">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                rows={4}
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Optional movement notes"
              />
            </div>
          </div>
        </fieldset>

        <RouteBuilder
          startLocation={form.startLocation}
          startLocationId={form.startLocationId}
          startDepartureTime={form.startDepartureTime}
          locations={locations}
          stops={stops}
          startLocationError={errors.startLocation}
          routePointsError={errors.routePoints}
          errors={errors}
          onStartLocationSelect={selectStartLocation}
          onStartDepartureChange={(value) => updateForm('startDepartureTime', value)}
          onStopChange={updateStop}
          onStopSelect={selectStopLocation}
          onAddStop={addStop}
          onRemoveStop={removeStop}
        />

        <SegmentPassengerSelector
          employees={employees}
          startLocation={form.startLocation}
          stops={stops.map((stop) => stop.location)}
          passengerIdsBySegment={passengerIdsBySegment}
          vehicleLeaderId={form.vehicleLeaderId}
          errors={errors}
          onSetPassenger={setPassenger}
          onRemovePassenger={removePassenger}
        />

        <div className="form-actions">
          <Link className="button button-secondary" to="/employee">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Request Changes' : 'Submit Movement Request'}
          </button>
        </div>
      </form>
    </div>
  )
}
