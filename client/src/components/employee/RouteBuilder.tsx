import { useState } from 'react'
import type { Location } from '../../types'
import type { FormErrors } from '../../utils/movement'
import { MOVEMENT_TIME_OPTIONS } from '../../utils/movementTimeOptions'
import { LocationSelectionDialog } from './LocationSelectionDialog'

interface MovementTimeSelectProps {
  id: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}

function MovementTimeSelect({ id, value, invalid, onChange }: MovementTimeSelectProps) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid}>
      <option value="">Select time...</option>
      {MOVEMENT_TIME_OPTIONS.map((time) => <option value={time} key={time}>{time}</option>)}
    </select>
  )
}

export interface RouteStopValue {
  location: string
  locationId: string
  latitude: number | null
  longitude: number | null
  arrivalTime: string
  departureTime: string
}

interface RouteBuilderProps {
  startLocation: string
  startLocationId: string
  startDepartureTime: string
  locations: Location[]
  stops: RouteStopValue[]
  startLocationError?: string
  routePointsError?: string
  errors: FormErrors
  onStartLocationSelect: (location: Location) => void
  onStartDepartureChange: (value: string) => void
  onStopChange: (index: number, field: keyof RouteStopValue, value: string) => void
  onStopSelect: (index: number, location: Location) => void
  onAddStop: () => void
  onRemoveStop: (index: number) => void
}

export function RouteBuilder({
  startLocation,
  startLocationId,
  startDepartureTime,
  locations,
  stops,
  startLocationError,
  routePointsError,
  errors,
  onStartLocationSelect,
  onStartDepartureChange,
  onStopChange,
  onStopSelect,
  onAddStop,
  onRemoveStop,
}: RouteBuilderProps) {
  const [locationDialog, setLocationDialog] = useState<{ type: 'start' | 'stop'; index?: number } | null>(null)
  return (
    <fieldset className="form-section">
      <legend>Route</legend>
      <p className="section-hint">Add each destination in travel order.</p>

      <div className="field-group">
        <label htmlFor="start-location">Start Location</label>
        <button
          type="button"
          id="start-location"
          className="employee-selection-field"
          onClick={() => setLocationDialog({ type: 'start' })}
          aria-invalid={Boolean(startLocationError)}
        >{startLocation || 'Select location...'}</button>
        {startLocationError && <p className="field-error">{startLocationError}</p>}
      </div>

      <div className="field-group route-start-departure">
        <label htmlFor="start-departure">Start Departure Time</label>
        <MovementTimeSelect id="start-departure" value={startDepartureTime} onChange={onStartDepartureChange} invalid={Boolean(errors.startDepartureTime)} />
        {errors.startDepartureTime && <p className="field-error">{errors.startDepartureTime}</p>}
      </div>

      <div className="stop-list">
        {stops.map((stop, index) => {
          const arrivalError = errors[`segments.${index}.arrivalTime`]
          const departureError = errors[`segments.${index + 1}.departureTime`]

          return (
            <div className="stop-row" key={index}>
              <div className="stop-fields">
                <div className="field-group">
                  <label htmlFor={`stop-${index}`}>Stop {index + 1} Location</label>
                  <button
                    type="button"
                    id={`stop-${index}`}
                    className="employee-selection-field"
                    onClick={() => setLocationDialog({ type: 'stop', index })}
                    aria-invalid={Boolean(routePointsError && !stop.location.trim())}
                  >{stop.location || 'Select location...'}</button>
                </div>
                <div className="stop-time-grid">
                  {index === 0 && index < stops.length - 1 && (
                    <div className="field-group">
                      <label htmlFor={`stop-${index}-departure`}>Departure Time</label>
                      <MovementTimeSelect
                        id={`stop-${index}-departure`}
                        value={stop.departureTime}
                        onChange={(value) => onStopChange(index, 'departureTime', value)}
                        invalid={Boolean(departureError)}
                      />
                      {departureError && <p className="field-error">{departureError}</p>}
                    </div>
                  )}
                  <div className="field-group">
                    <label htmlFor={`stop-${index}-arrival`}>Arrival Time</label>
                    <MovementTimeSelect
                      id={`stop-${index}-arrival`}
                      value={stop.arrivalTime}
                      onChange={(value) => onStopChange(index, 'arrivalTime', value)}
                      invalid={Boolean(arrivalError)}
                    />
                    {arrivalError && <p className="field-error">{arrivalError}</p>}
                  </div>
                  {index > 0 && index < stops.length - 1 && (
                      <div className="field-group">
                        <label htmlFor={`stop-${index}-departure`}>Departure Time</label>
                        <MovementTimeSelect
                          id={`stop-${index}-departure`}
                          value={stop.departureTime}
                          onChange={(value) => onStopChange(index, 'departureTime', value)}
                          invalid={Boolean(departureError)}
                        />
                        {departureError && <p className="field-error">{departureError}</p>}
                      </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="button button-quiet remove-stop"
                onClick={() => onRemoveStop(index)}
                disabled={stops.length === 1}
                aria-label={`Remove stop ${index + 1}`}
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      {routePointsError && <p className="field-error">{routePointsError}</p>}
      <button type="button" className="button button-secondary" onClick={onAddStop}>
        + Add Stop
      </button>

      <div className="route-preview" aria-label="Route preview">
        <h3>Route preview</h3>
        <ol>
          {[startLocation, ...stops.map((stop) => stop.location)].map((point, index) => (
            <li key={index}>
              <span className="route-point-index">{index + 1}</span>
              <span>{point.trim() || (index === 0 ? 'Start location' : `Stop ${index}`)}</span>
            </li>
          ))}
        </ol>
      </div>
      <LocationSelectionDialog
        key={locationDialog ? `${locationDialog.type}-${locationDialog.index ?? 'start'}` : 'closed'}
        isOpen={Boolean(locationDialog)}
        title={locationDialog?.type === 'start' ? 'Select Start Location' : `Select Stop ${Number(locationDialog?.index) + 1} Location`}
        locations={locations}
        selectedLocationId={locationDialog?.type === 'start' ? startLocationId : locationDialog?.index === undefined ? undefined : stops[locationDialog.index].locationId}
        onSelect={(location) => {
          if (locationDialog?.type === 'start') onStartLocationSelect(location)
          else if (locationDialog?.index !== undefined) onStopSelect(locationDialog.index, location)
          setLocationDialog(null)
        }}
        onClose={() => setLocationDialog(null)}
      />
    </fieldset>
  )
}
