import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/PageState'
import { StatusBadge } from '../../components/StatusBadge'
import {
  downloadMovementPlan,
  fetchFinalApprovedSafetyMovements,
  fetchSafetyMovements,
  fetchWhatsAppBatchPreview,
  getEmployees,
} from '../../services/api'
import type { WhatsAppBatchPreview } from '../../services/api'
import type { Employee, Movement, MovementStatus } from '../../types'
import { formatDate } from '../../utils/movement'

const summaryItems: Array<{ label: string; status: MovementStatus }> = [
  { label: 'Pending Review', status: 'PENDING_SAFETY' },
  { label: 'Safety Approved', status: 'SAFETY_APPROVED' },
  { label: 'Returned', status: 'RETURNED_FOR_MODIFICATION' },
  { label: 'Rejected', status: 'SAFETY_REJECTED' },
]

export function SafetyDashboardPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [finalMovements, setFinalMovements] = useState<Movement[]>([])
  const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([])
  const [isLoadingBatch, setIsLoadingBatch] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [whatsAppPreview, setWhatsAppPreview] = useState<WhatsAppBatchPreview | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const previewTextRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let isCurrent = true
    Promise.all([fetchSafetyMovements(), getEmployees()])
      .then(([movementData, employeeData]) => {
        if (isCurrent) {
          setMovements(movementData)
          setEmployees(employeeData)
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load Safety movements.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [reloadKey])

  useEffect(() => {
    if (!selectedDate) {
      return undefined
    }

    let isCurrent = true
    fetchFinalApprovedSafetyMovements(selectedDate)
      .then((movementData) => {
        if (isCurrent) setFinalMovements(movementData)
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setFinalMovements([])
          setBatchError(loadError instanceof Error
            ? loadError.message
            : 'Final-approved movements could not be loaded for this date.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingBatch(false)
      })

    return () => {
      isCurrent = false
    }
  }, [selectedDate])

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.displayName])),
    [employees],
  )

  const counts = useMemo(
    () => new Map(summaryItems.map((item) => [
      item.status,
      movements.filter((movement) => movement.status === item.status).length,
    ])),
    [movements],
  )

  const finalApprovedCount = useMemo(
    () => movements.filter((movement) => movement.status === 'FINAL_APPROVED').length,
    [movements],
  )

  function retryLoad() {
    setIsLoading(true)
    setError('')
    setReloadKey((key) => key + 1)
  }

  async function exportMovementPlan() {
    setIsExporting(true)
    setExportError('')
    try {
      const file = await downloadMovementPlan()
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (downloadError: unknown) {
      setExportError(downloadError instanceof Error
        ? downloadError.message
        : 'The Movement Plan could not be generated.')
    } finally {
      setIsExporting(false)
    }
  }

  function toggleMovement(movementId: string) {
    setSelectedMovementIds((current) => current.includes(movementId)
      ? current.filter((id) => id !== movementId)
      : [...current, movementId])
    setCopyStatus('idle')
  }

  function changeSelectedDate(date: string) {
    setSelectedDate(date)
    setFinalMovements([])
    setSelectedMovementIds([])
    setWhatsAppPreview(null)
    setCopyStatus('idle')
    setBatchError('')
    setIsLoadingBatch(Boolean(date))
  }

  async function previewWhatsApp() {
    if (!selectedDate || selectedMovementIds.length === 0) return
    setIsPreviewing(true)
    setBatchError('')
    setCopyStatus('idle')
    try {
      setWhatsAppPreview(await fetchWhatsAppBatchPreview(selectedDate, selectedMovementIds))
    } catch (previewError: unknown) {
      setBatchError(previewError instanceof Error
        ? previewError.message
        : 'The WhatsApp preview could not be generated.')
    } finally {
      setIsPreviewing(false)
    }
  }

  function closeWhatsAppPreview() {
    setWhatsAppPreview(null)
    setCopyStatus('idle')
  }

  async function copyAllWhatsAppText() {
    if (!whatsAppPreview) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(whatsAppPreview.text)
      } else {
        previewTextRef.current?.select()
        if (!document.execCommand('copy')) throw new Error('Copy command failed')
      }
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  useEffect(() => {
    if (!whatsAppPreview) return undefined
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeWhatsAppPreview()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [whatsAppPreview])

  return (
    <div className="employee-page safety-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Safety workspace</p>
          <h2>Movement Review Queue</h2>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={exportMovementPlan}
          disabled={isLoading || isExporting || finalApprovedCount === 0}
        >
          {isExporting ? 'Exporting...' : 'Export Movement Plan'}
        </button>
      </div>

      {exportError && <p className="field-error" role="alert">{exportError}</p>}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          title="Safety queue could not be loaded"
          message={error}
          action={<button type="button" className="button button-secondary" onClick={retryLoad}>Try Again</button>}
        />
      ) : (
        <>
          <section className="safety-summary" aria-label="Safety review summary">
            {summaryItems.map((item) => (
              <article className={`summary-stat summary-${item.status.toLowerCase()}`} key={item.status}>
                <span>{item.label}</span>
                <strong>{counts.get(item.status) ?? 0}</strong>
              </article>
            ))}
          </section>

          <section className="whatsapp-batch-panel" aria-labelledby="whatsapp-batch-title">
            <div className="whatsapp-batch-heading">
              <div>
                <p className="page-eyebrow">Final-approved movements</p>
                <h3 id="whatsapp-batch-title">WhatsApp Batch Preview</h3>
                <p>Select a date, then choose the movements to include in one message.</p>
              </div>
              <label className="whatsapp-date-field">
                <span>Movement date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => changeSelectedDate(event.target.value)}
                />
              </label>
            </div>

            {batchError && <p className="field-error" role="alert">{batchError}</p>}

            {!selectedDate ? (
              <p className="whatsapp-batch-empty">Choose a date to load final-approved movements.</p>
            ) : isLoadingBatch ? (
              <p className="whatsapp-batch-empty" role="status">Loading movements...</p>
            ) : finalMovements.length === 0 ? (
              <p className="whatsapp-batch-empty">No final-approved movements are available for this date.</p>
            ) : (
              <>
                <div className="whatsapp-selection-toolbar">
                  <div>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => setSelectedMovementIds(finalMovements.map((movement) => movement.id))}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={() => setSelectedMovementIds([])}
                      disabled={selectedMovementIds.length === 0}
                    >
                      Clear Selection
                    </button>
                  </div>
                  <span>{selectedMovementIds.length} of {finalMovements.length} selected</span>
                </div>

                <div className="whatsapp-movement-options">
                  {finalMovements.map((movement) => (
                    <label className="whatsapp-movement-option" key={movement.id}>
                      <input
                        type="checkbox"
                        checked={selectedMovementIds.includes(movement.id)}
                        onChange={() => toggleMovement(movement.id)}
                      />
                      <span>
                        <strong>{movement.purpose}</strong>
                        <small>{movement.id} · {movement.etd}–{movement.eta}</small>
                      </span>
                      <StatusBadge status={movement.status} />
                    </label>
                  ))}
                </div>

                <div className="whatsapp-batch-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={previewWhatsApp}
                    disabled={selectedMovementIds.length === 0 || isPreviewing}
                  >
                    {isPreviewing ? 'Generating...' : 'WhatsApp Preview'}
                  </button>
                </div>
              </>
            )}
          </section>

          {movements.length === 0 ? (
            <div className="empty-state">
              <h3>No movements in the Safety queue</h3>
              <p>Submitted employee movements will appear here.</p>
            </div>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table safety-table">
                <thead>
                  <tr>
                    <th scope="col">Movement</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date / Time</th>
                    <th scope="col">Requester</th>
                    <th scope="col">Vehicle Leader</th>
                    <th scope="col">Segments</th>
                    <th scope="col"><span className="visually-hidden">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td data-label="Movement">
                        <span className="request-link static-request">
                          <strong>{movement.purpose}</strong>
                          <span>{movement.id}</span>
                        </span>
                      </td>
                      <td data-label="Status"><StatusBadge status={movement.status} /></td>
                      <td data-label="Date / Time">{formatDate(movement.movementDate)}<small>{movement.etd} / {movement.eta}</small></td>
                      <td data-label="Requester">{employeeNames.get(movement.requesterId) ?? 'Unknown employee'}</td>
                      <td data-label="Vehicle Leader">{employeeNames.get(movement.vehicleLeaderId) ?? 'Unknown employee'}</td>
                      <td data-label="Segments">{movement.segments.length}</td>
                      <td data-label="Action">
                        <Link className="button button-secondary button-small" to={`/safety/movements/${movement.id}`}>
                          {movement.status === 'PENDING_SAFETY' ? 'Review' : 'View'}
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

      {whatsAppPreview && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWhatsAppPreview()
          }}
        >
          <section
            className="whatsapp-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-preview-title"
          >
            <header className="whatsapp-preview-header">
              <div>
                <p className="page-eyebrow">{whatsAppPreview.movementCount} movements · {whatsAppPreview.date}</p>
                <h3 id="whatsapp-preview-title">WhatsApp Preview</h3>
              </div>
              <button
                type="button"
                className="dialog-close"
                onClick={closeWhatsAppPreview}
                aria-label="Close WhatsApp preview"
                title="Close"
              >
                ×
              </button>
            </header>
            <textarea
              ref={previewTextRef}
              className="whatsapp-preview-text"
              value={whatsAppPreview.text}
              readOnly
              dir="rtl"
              lang="ar"
              aria-label="Combined Arabic WhatsApp movement text"
            />
            <footer className="whatsapp-preview-actions">
              <span className={copyStatus === 'error' ? 'field-error' : 'copy-status'} role="status">
                {copyStatus === 'copied' && 'All movements copied to clipboard.'}
                {copyStatus === 'error' && 'Copy failed. Select the text and copy it manually.'}
              </span>
              <button type="button" className="button button-primary" onClick={copyAllWhatsAppText}>
                Copy All
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
