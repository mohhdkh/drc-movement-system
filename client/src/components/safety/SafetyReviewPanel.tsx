import { useState } from 'react'
import { CURRENT_SAFETY_REVIEWER_ID } from '../../data/safetyUser'
import { ApiRequestError, submitSafetyReview } from '../../services/api'
import type {
  Employee,
  GPSDevice,
  Movement,
  SafetyReviewAction,
  SafetyReviewPayload,
} from '../../types'
import { SafetyReviewSummary } from './SafetyReviewSummary'

interface SafetyReviewPanelProps {
  movement: Movement
  employees: Employee[]
  gpsDevices: GPSDevice[]
  onReviewed: (movement: Movement) => void
}

type GpsChoice = 'DEVICE' | 'NO_GPS' | ''

export function SafetyReviewPanel({
  movement,
  employees,
  gpsDevices,
  onReviewed,
}: SafetyReviewPanelProps) {
  const [gpsType, setGpsType] = useState<GpsChoice>('')
  const [gpsDeviceId, setGpsDeviceId] = useState('')
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requestError, setRequestError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [processingAction, setProcessingAction] = useState<SafetyReviewAction | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)

  if (movement.status !== 'PENDING_SAFETY') {
    return (
      <section className="details-section safety-review-panel" aria-labelledby="safety-review-title">
        <h3 id="safety-review-title">Safety review</h3>
        {successMessage && <div className="form-success" role="status">{successMessage}</div>}
        <SafetyReviewSummary
          movement={movement}
          employees={employees}
          gpsDevices={gpsDevices}
        />
      </section>
    )
  }

  function validateAction(action: SafetyReviewAction) {
    const nextErrors: Record<string, string> = {}

    if (action === 'APPROVE') {
      if (!gpsType) {
        nextErrors['gpsAssignment.type'] = 'Choose a GPS device or No GPS Required.'
      } else if (gpsType === 'DEVICE' && !gpsDeviceId) {
        nextErrors['gpsAssignment.gpsDeviceId'] = 'Select an active GPS device.'
      }
    }

    if ((action === 'REJECT' || action === 'RETURN') && !comment.trim()) {
      nextErrors.comment = `${action === 'REJECT' ? 'Rejection' : 'Return'} reason is required.`
    }

    setErrors(nextErrors)
    setRequestError('')
    return Object.keys(nextErrors).length === 0
  }

  async function performReview(action: SafetyReviewAction) {
    if (!validateAction(action)) return

    const payload: SafetyReviewPayload = {
      action,
      reviewedBy: CURRENT_SAFETY_REVIEWER_ID,
      comment: comment.trim() || undefined,
    }

    if (action === 'APPROVE') {
      payload.gpsAssignment = gpsType === 'DEVICE'
        ? { type: 'DEVICE', gpsDeviceId }
        : { type: 'NO_GPS', gpsDeviceId: null }
    }

    setProcessingAction(action)
    setConfirmReject(false)
    try {
      const reviewedMovement = await submitSafetyReview(movement.id, payload)
      const actionLabel = action === 'APPROVE'
        ? 'approved'
        : action === 'REJECT'
          ? 'rejected'
          : 'returned for modification'
      setSuccessMessage(`Movement ${actionLabel} successfully.`)
      onReviewed(reviewedMovement)
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(
          Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])),
        )
        setRequestError(error.message)
      } else {
        setRequestError('The Safety decision could not be saved.')
      }
    } finally {
      setProcessingAction(null)
    }
  }

  function requestReject() {
    if (validateAction('REJECT')) {
      setConfirmReject(true)
    }
  }

  const isProcessing = processingAction !== null

  return (
    <section className="details-section safety-review-panel" aria-labelledby="safety-review-title">
      <h3 id="safety-review-title">Safety review</h3>
      <p className="section-hint">Choose an explicit GPS option before approving.</p>

      {requestError && <div className="form-alert" role="alert">{requestError}</div>}

      <fieldset className="gps-choice-group">
        <legend>GPS Assignment</legend>
        <div className="review-choice-grid">
          <label className="review-choice">
            <input
              type="radio"
              name="gps-type"
              value="DEVICE"
              checked={gpsType === 'DEVICE'}
              onChange={() => {
                setGpsType('DEVICE')
                setErrors({})
              }}
            />
            <span><strong>Assign GPS Device</strong><small>Reserve an active device for this movement.</small></span>
          </label>
          <label className="review-choice">
            <input
              type="radio"
              name="gps-type"
              value="NO_GPS"
              checked={gpsType === 'NO_GPS'}
              onChange={() => {
                setGpsType('NO_GPS')
                setGpsDeviceId('')
                setErrors({})
              }}
            />
            <span><strong>No GPS Required</strong><small>Approve without assigning a device.</small></span>
          </label>
        </div>
        {errors['gpsAssignment.type'] && (
          <p className="field-error">{errors['gpsAssignment.type']}</p>
        )}
      </fieldset>

      {gpsType === 'DEVICE' && (
        <div className="field-group gps-device-field">
          <label htmlFor="gps-device">GPS Device</label>
          <select
            id="gps-device"
            value={gpsDeviceId}
            onChange={(event) => {
              setGpsDeviceId(event.target.value)
              setErrors({})
            }}
            aria-invalid={Boolean(errors['gpsAssignment.gpsDeviceId'])}
          >
            <option value="">Select an active device</option>
            {gpsDevices.map((device) => (
              <option key={device.id} value={device.id}>{device.code} - {device.name}</option>
            ))}
          </select>
          {errors['gpsAssignment.gpsDeviceId'] && (
            <p className="field-error">{errors['gpsAssignment.gpsDeviceId']}</p>
          )}
        </div>
      )}

      <div className="field-group review-comment-field">
        <label htmlFor="safety-comment">Safety Comment</label>
        <textarea
          id="safety-comment"
          rows={4}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value)
            setErrors({})
            setConfirmReject(false)
          }}
          placeholder="Optional for approval; required when returning or rejecting"
          aria-invalid={Boolean(errors.comment)}
        />
        {errors.comment && <p className="field-error">{errors.comment}</p>}
      </div>

      {confirmReject && (
        <div className="reject-confirmation" role="alert">
          <div>
            <strong>Reject this movement?</strong>
            <p>This decision cannot be changed in Phase 3.</p>
          </div>
          <div className="confirmation-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setConfirmReject(false)}
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => performReview('REJECT')}
              disabled={isProcessing}
            >
              {processingAction === 'REJECT' ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      )}

      <div className="review-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={() => performReview('APPROVE')}
          disabled={isProcessing}
        >
          {processingAction === 'APPROVE' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          className="button button-return"
          onClick={() => performReview('RETURN')}
          disabled={isProcessing}
        >
          {processingAction === 'RETURN' ? 'Returning...' : 'Return for Modification'}
        </button>
        <button
          type="button"
          className="button button-danger-outline"
          onClick={requestReject}
          disabled={isProcessing || confirmReject}
        >
          Reject
        </button>
      </div>
    </section>
  )
}

