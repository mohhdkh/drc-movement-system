import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ApiRequestError,
  createAdminResource,
  fetchAdminResources,
  updateAdminResource,
  updateAdminResourceStatus,
} from '../../services/api'
import type { AdminResource, AdminResourceName } from '../../types'
import { ErrorState, LoadingState } from '../PageState'
import { ActiveBadge } from './ActiveBadge'
import { AdminSectionNav } from './AdminSectionNav'

export interface AdminResourceField {
  name: string
  label: string
  type?: 'text' | 'tel' | 'number'
  required?: boolean
}

interface AdminResourcePageProps {
  resource: AdminResourceName
  title: string
  itemLabel: string
  fields: AdminResourceField[]
}

type FormValues = Record<string, string>

function emptyForm(fields: AdminResourceField[]): FormValues {
  return Object.fromEntries(['id', ...fields.map((field) => field.name)].map((name) => [name, '']))
}

function itemValue(item: AdminResource, field: string) {
  return (item as unknown as Record<string, unknown>)[field]
}

export function AdminResourcePage({
  resource,
  title,
  itemLabel,
  fields,
}: AdminResourcePageProps) {
  const [items, setItems] = useState<AdminResource[]>([])
  const [form, setForm] = useState<FormValues>(() => emptyForm(fields))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let isCurrent = true
    fetchAdminResources(resource)
      .then((data) => {
        if (isCurrent) setItems(data)
      })
      .catch((error: unknown) => {
        if (isCurrent) setLoadError(error instanceof Error ? error.message : `Unable to load ${title}.`)
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [resource, title])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' ? item.active : !item.active)
      const searchable = [item.id, ...fields.map((field) => itemValue(item, field.name))]
        .join(' ')
        .toLowerCase()
      return matchesStatus && (!query || searchable.includes(query))
    })
  }, [fields, items, search, statusFilter])

  function resetEditor() {
    setEditingId(null)
    setForm(emptyForm(fields))
    setErrors({})
  }

  function editItem(item: AdminResource) {
    const values: FormValues = { id: item.id }
    for (const field of fields) {
      values[field.name] = itemValue(item, field.name)?.toString() ?? ''
    }
    setEditingId(item.id)
    setForm(values)
    setErrors({})
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
    setErrors({})
    setMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const nextErrors: Record<string, string> = {}
    if (!editingId && !form.id.trim()) nextErrors.id = 'ID is required.'
    for (const field of fields) {
      if (field.required && !form[field.name]?.trim()) {
        nextErrors[field.name] = `${field.label} is required.`
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const payload: Record<string, unknown> = {}
    if (!editingId) payload.id = form.id.trim()
    for (const field of fields) {
      payload[field.name] = field.type === 'number'
        ? form[field.name] === '' ? null : Number(form[field.name])
        : form[field.name]
    }

    setIsSubmitting(true)
    try {
      const saved = editingId
        ? await updateAdminResource(resource, editingId, payload)
        : await createAdminResource(resource, payload)
      setItems((current) => editingId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved])
      setMessage(`${itemLabel} ${editingId ? 'updated' : 'created'} successfully.`)
      resetEditor()
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])))
        setMessage(error.message)
      } else {
        setMessage(`The ${itemLabel.toLowerCase()} could not be saved.`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function toggleStatus(item: AdminResource) {
    const nextActive = !item.active
    if (!window.confirm(`${nextActive ? 'Reactivate' : 'Deactivate'} ${itemLabel.toLowerCase()} ${item.id}?`)) return
    try {
      const updated = await updateAdminResourceStatus(resource, item.id, nextActive)
      setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate))
      setMessage(`${itemLabel} ${nextActive ? 'reactivated' : 'deactivated'} successfully.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to update ${itemLabel.toLowerCase()} status.`)
    }
  }

  return (
    <div className="employee-page admin-page">
      <div className="page-heading"><div><p className="page-eyebrow">Admin workspace</p><h2>{title}</h2></div></div>
      <AdminSectionNav />

      {isLoading ? <LoadingState /> : loadError ? (
        <ErrorState title={`${title} could not be loaded`} message={loadError} />
      ) : (
        <>
          <section className="admin-editor" aria-labelledby="resource-editor-title">
            <div className="admin-section-heading">
              <div><h3 id="resource-editor-title">{editingId ? `Edit ${itemLabel}` : `Create ${itemLabel}`}</h3><p>{editingId ? editingId : `Add a new ${itemLabel.toLowerCase()} to the shared directory.`}</p></div>
              {editingId && <button type="button" className="button button-secondary" onClick={resetEditor}>Cancel Edit</button>}
            </div>
            {message && <div className={Object.keys(errors).length ? 'form-alert admin-message' : 'form-success'} role="status">{message}</div>}
            <form className="admin-form-grid" onSubmit={handleSubmit} noValidate>
              <div className="field-group">
                <label htmlFor={`${resource}-id`}>ID</label>
                <input id={`${resource}-id`} value={form.id} onChange={(event) => updateField('id', event.target.value)} disabled={Boolean(editingId)} aria-invalid={Boolean(errors.id)} />
                {errors.id && <p className="field-error">{errors.id}</p>}
              </div>
              {fields.map((field) => (
                <div className="field-group" key={field.name}>
                  <label htmlFor={`${resource}-${field.name}`}>{field.label}</label>
                  <input id={`${resource}-${field.name}`} type={field.type ?? 'text'} step={field.type === 'number' ? 'any' : undefined} value={form[field.name]} onChange={(event) => updateField(field.name, event.target.value)} aria-invalid={Boolean(errors[field.name])} />
                  {errors[field.name] && <p className="field-error">{errors[field.name]}</p>}
                </div>
              ))}
              <div className="admin-form-action"><button type="submit" className="button button-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : `Create ${itemLabel}`}</button></div>
            </form>
          </section>

          <section className="admin-list-section" aria-labelledby="resource-list-title">
            <div className="admin-section-heading"><div><h3 id="resource-list-title">{title}</h3><p>{filteredItems.length} of {items.length} records</p></div></div>
            <div className="admin-filters">
              <div className="field-group"><label htmlFor={`${resource}-search`}>Search</label><input id={`${resource}-search`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} /></div>
              <div className="field-group"><label htmlFor={`${resource}-status-filter`}>Status</label><select id={`${resource}-status-filter`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
            </div>
            <div className="request-table-wrap">
              <table className="request-table admin-table">
                <thead><tr><th>ID</th>{fields.map((field) => <th key={field.name}>{field.label}</th>)}<th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>{filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td data-label="ID">{item.id}</td>
                    {fields.map((field) => <td data-label={field.label} key={field.name}>{itemValue(item, field.name)?.toString() || 'Not provided'}</td>)}
                    <td data-label="Status"><ActiveBadge active={item.active} /></td>
                    <td data-label="Actions"><div className="table-actions"><button type="button" className="button button-secondary button-small" onClick={() => editItem(item)}>Edit</button><button type="button" className="button button-quiet button-small" onClick={() => toggleStatus(item)}>{item.active ? 'Deactivate' : 'Reactivate'}</button></div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
