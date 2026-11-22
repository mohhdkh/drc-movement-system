import { useState } from 'react'
import { ApiRequestError, submitAreaManagerReview } from '../../services/api'
import type { AreaManagerDecision, Employee, Movement } from '../../types'
import { AreaManagerDecisionSummary } from './AreaManagerDecisionSummary'

interface AreaManagerReviewPanelProps {
  movement: Movement
  employees: Employee[]
  onReviewed: (movement: Movement) => void
}

export function AreaManagerReviewPanel({
  movement,
  employees,
  onReviewed,
}: AreaManagerReviewPanelProps) {
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [requestError, setRequestError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [processingDecision, setProcessingDecision] = useState<AreaManagerDecision | null>(null)

  if (movement.status !== 'VEHICLE_ASSIGNED') {
    return (
      <section className="details-section area-review-panel" aria-labelledby="area-review-title">
        <h3 id="area-review-title">Area Manager decision</h3>
        {successMessage && <div className="form-success" role="status">{successMessage}</div>}
        <AreaManagerDecisionSummary movement={movement} employees={employees} />
      </section>
    )
  }

  async function performReview(decision: AreaManagerDecision) {
    if (processingDecision) return

    const nextErrors: Record<string, string> = {}
    if (decision === 'REJECTED' && !comment.trim()) {
      nextErrors.comment = 'Rejection reason is required.'
    }
    setErrors(nextErrors)
    setRequestError('')

    if (Object.keys(nextErrors).length > 0) return

    setProcessingDecision(decision)
    try {
      const reviewedMovement = await submitAreaManagerReview(movement.id, {
        decision,
        comment: comment.trim() || undefined,
      })
      setSuccessMessage(
        decision === 'APPROVED'
          ? 'Movement approved successfully.'
          : 'Movement rejected successfully.',
      )
      onReviewed(reviewedMovement)
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(
          Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])),
        )
        setRequestError(error.message)
      } else {
        setRequestError('The Area Manager decision could not be saved.')
      }
    } finally {
      setProcessingDecision(null)
    }
  }

  const isProcessing = processingDecision !== null

  return (
    <section className="details-section area-review-panel" aria-labelledby="area-review-title">
      <h3 id="area-review-title">Area Manager decision</h3>
      <p className="section-hint">Review the complete movement before recording the final decision.</p>

      {requestError && <div className="form-alert" role="alert">{requestError}</div>}

      <div className="field-group review-comment-field">
        <label htmlFor="area-manager-comment">Area Manager Comment</label>
        <textarea
          id="area-manager-comment"
          rows={4}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value)
            setErrors({})
          }}
          placeholder="Optional for approval; required for rejection"
          aria-invalid={Boolean(errors.comment)}
          disabled={isProcessing}
        />
        {errors.comment && <p className="field-error">{errors.comment}</p>}
      </div>

      <div className="review-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={() => performReview('APPROVED')}
          disabled={isProcessing}
        >
          {processingDecision === 'APPROVED' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          className="button button-danger-outline"
          onClick={() => performReview('REJECTED')}
          disabled={isProcessing}
        >
          {processingDecision === 'REJECTED' ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
    </section>
  )
}
