import { useEffect, useMemo, useState } from 'react'
import { AdminSectionNav } from '../../components/admin/AdminSectionNav'
import { ErrorState, LoadingState } from '../../components/PageState'
import { fetchAdminAuditLog } from '../../services/api'
import type { AdminAuditEntry } from '../../types'
import { formatDateTime } from '../../utils/movement'

export function AdminAuditLogPage() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([])
  const [entityFilter, setEntityFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    fetchAdminAuditLog()
      .then((data) => {
        if (isCurrent) setEntries(data)
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'Unable to load audit log.')
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [])

  const entityTypes = useMemo(() => [...new Set(entries.map((entry) => entry.entityType))].sort(), [entries])
  const actions = useMemo(() => [...new Set(entries.map((entry) => entry.action))].sort(), [entries])
  const filteredEntries = useMemo(() => entries.filter((entry) => (
    (entityFilter === 'ALL' || entry.entityType === entityFilter)
    && (actionFilter === 'ALL' || entry.action === actionFilter)
  )), [actionFilter, entityFilter, entries])

  return (
    <div className="employee-page admin-page">
      <div className="page-heading"><div><p className="page-eyebrow">Admin workspace</p><h2>Admin Audit Log</h2></div></div>
      <AdminSectionNav />
      {isLoading ? <LoadingState /> : error ? <ErrorState title="Audit log could not be loaded" message={error} /> : (
        <section className="admin-list-section" aria-labelledby="audit-list-title">
          <div className="admin-section-heading"><div><h3 id="audit-list-title">Recorded changes</h3><p>Newest changes appear first.</p></div></div>
          <div className="admin-filters">
            <div className="field-group"><label htmlFor="audit-entity-filter">Entity Type</label><select id="audit-entity-filter" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}><option value="ALL">All entity types</option>{entityTypes.map((type) => <option value={type} key={type}>{type.replaceAll('_', ' ')}</option>)}</select></div>
            <div className="field-group"><label htmlFor="audit-action-filter">Action</label><select id="audit-action-filter" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="ALL">All actions</option>{actions.map((action) => <option value={action} key={action}>{action.replaceAll('_', ' ')}</option>)}</select></div>
          </div>
          {filteredEntries.length === 0 ? <div className="empty-state"><h3>No audit entries</h3><p>Admin changes will appear here.</p></div> : (
            <div className="request-table-wrap"><table className="request-table admin-table audit-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Changes</th></tr></thead><tbody>{filteredEntries.map((entry) => <tr key={entry.id}><td data-label="Timestamp">{formatDateTime(entry.timestamp)}<small>{entry.id}</small></td><td data-label="Actor">{entry.actorName}<small>{entry.actorId}</small></td><td data-label="Action">{entry.action.replaceAll('_', ' ')}</td><td data-label="Entity">{entry.entityType.replaceAll('_', ' ')}<small>{entry.entityId}</small></td><td data-label="Changes"><details><summary>Before / after</summary><div className="audit-change-grid"><div><strong>Before</strong><pre>{JSON.stringify(entry.before, null, 2)}</pre></div><div><strong>After</strong><pre>{JSON.stringify(entry.after, null, 2)}</pre></div></div></details></td></tr>)}</tbody></table></div>
          )}
        </section>
      )}
    </div>
  )
}
