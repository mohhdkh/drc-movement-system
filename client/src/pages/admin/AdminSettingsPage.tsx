import { type FormEvent, useEffect, useState } from 'react'
import { AdminSectionNav } from '../../components/admin/AdminSectionNav'
import { ErrorState, LoadingState } from '../../components/PageState'
import { ApiRequestError, fetchAdminSettings, updateAdminSettings } from '../../services/api'
import type { SystemSettings } from '../../types'

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let isCurrent = true
    fetchAdminSettings()
      .then((data) => {
        if (isCurrent) setSettings(data)
      })
      .catch((error: unknown) => {
        if (isCurrent) setLoadError(error instanceof Error ? error.message : 'Unable to load settings.')
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings || isSubmitting) return
    setIsSubmitting(true)
    setErrors({})
    setMessage('')
    try {
      const updated = await updateAdminSettings(settings)
      setSettings(updated)
      setMessage('System settings updated successfully.')
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])))
        setMessage(error.message)
      } else {
        setMessage('System settings could not be updated.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="employee-page admin-page">
      <div className="page-heading"><div><p className="page-eyebrow">Admin workspace</p><h2>System Settings</h2></div></div>
      <AdminSectionNav />
      {isLoading ? <LoadingState /> : loadError || !settings ? (
        <ErrorState title="Settings could not be loaded" message={loadError} />
      ) : (
        <section className="admin-editor admin-settings-panel" aria-labelledby="settings-title">
          <div className="admin-section-heading"><div><h3 id="settings-title">Movement submission settings</h3><p>Updates apply immediately to future backend cutoff validation.</p></div></div>
          {message && <div className={Object.keys(errors).length ? 'form-alert admin-message' : 'form-success'} role="status">{message}</div>}
          <form className="admin-form-grid" onSubmit={handleSubmit} noValidate>
            <div className="field-group"><label htmlFor="movement-timezone">Movement Timezone</label><input id="movement-timezone" value={settings.movementTimezone} onChange={(event) => { setSettings({ ...settings, movementTimezone: event.target.value }); setErrors({}) }} aria-invalid={Boolean(errors.movementTimezone)} />{errors.movementTimezone && <p className="field-error">{errors.movementTimezone}</p>}</div>
            <div className="field-group"><label htmlFor="movement-cutoff-hour">Movement Cutoff Hour</label><input id="movement-cutoff-hour" type="number" min="0" max="23" step="1" value={settings.movementCutoffHour} onChange={(event) => { setSettings({ ...settings, movementCutoffHour: Number(event.target.value) }); setErrors({}) }} aria-invalid={Boolean(errors.movementCutoffHour)} />{errors.movementCutoffHour && <p className="field-error">{errors.movementCutoffHour}</p>}</div>
            <div className="admin-form-action"><button type="submit" className="button button-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Settings'}</button></div>
          </form>
        </section>
      )}
    </div>
  )
}
