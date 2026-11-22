import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { ActiveBadge } from '../../components/admin/ActiveBadge'
import { AdminSectionNav } from '../../components/admin/AdminSectionNav'
import { ErrorState, LoadingState } from '../../components/PageState'
import {
  ApiRequestError,
  createAdminUser,
  fetchAdminResources,
  fetchAdminUsers,
  updateAdminUser,
  updateAdminUserRoles,
  updateAdminUserStatus,
} from '../../services/api'
import { USER_ROLES } from '../../types'
import type { Department, User, UserRole } from '../../types'

interface UserForm {
  id: string
  name: string
  email: string
  phone: string
  departmentId: string
  roles: UserRole[]
  active: boolean
}

const emptyUserForm = (): UserForm => ({
  id: '',
  name: '',
  email: '',
  phone: '',
  departmentId: '',
  roles: ['EMPLOYEE'],
  active: true,
})

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [form, setForm] = useState<UserForm>(emptyUserForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let isCurrent = true
    Promise.all([fetchAdminUsers(), fetchAdminResources<Department>('departments')])
      .then(([userData, departmentData]) => {
        if (isCurrent) {
          setUsers(userData)
          setDepartments(departmentData)
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) setLoadError(error instanceof Error ? error.message : 'Unable to load users.')
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [])

  const departmentNames = useMemo(
    () => new Map(departments.map((department) => [department.id, department.name])),
    [departments],
  )
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesSearch = !query || [user.id, user.name, user.email, user.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
      const matchesRole = roleFilter === 'ALL' || user.roles.includes(roleFilter as UserRole)
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' ? user.active : !user.active)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [roleFilter, search, statusFilter, users])

  function resetEditor() {
    setEditingId(null)
    setForm(emptyUserForm())
    setErrors({})
  }

  function editUser(user: User) {
    setEditingId(user.id)
    setForm({
      id: user.id,
      name: user.name,
      email: user.email ?? '',
      phone: user.phone ?? '',
      departmentId: user.departmentId ?? '',
      roles: [...user.roles],
      active: user.active,
    })
    setErrors({})
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateField(field: keyof Omit<UserForm, 'roles' | 'active'>, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors({})
    setMessage('')
  }

  function toggleRole(role: UserRole) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }))
    setErrors({})
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const nextErrors: Record<string, string> = {}
    if (!editingId && !form.id.trim()) nextErrors.id = 'User ID is required.'
    if (!form.name.trim()) nextErrors.name = 'User name is required.'
    if (form.active && form.roles.length === 0) nextErrors.roles = 'Active users need at least one role.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setIsSubmitting(true)
    try {
      let saved: User
      if (editingId) {
        saved = await updateAdminUser(editingId, {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          departmentId: form.departmentId || null,
        })
        saved = await updateAdminUserRoles(editingId, form.roles)
      } else {
        saved = await createAdminUser({
          id: form.id,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          departmentId: form.departmentId || null,
          roles: form.roles,
          active: form.active,
        })
      }
      setUsers((current) => editingId
        ? current.map((user) => user.id === saved.id ? saved : user)
        : [...current, saved])
      setMessage(`User ${editingId ? 'updated' : 'created'} successfully.`)
      resetEditor()
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(Object.fromEntries(error.validationErrors.map((item) => [item.field, item.message])))
        setMessage(error.message)
      } else {
        setMessage('The user could not be saved.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function toggleStatus(user: User) {
    const nextActive = !user.active
    if (!window.confirm(`${nextActive ? 'Reactivate' : 'Deactivate'} ${user.name}?`)) return
    try {
      const updated = await updateAdminUserStatus(user.id, nextActive)
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item))
      setMessage(`${user.name} ${nextActive ? 'reactivated' : 'deactivated'}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update user status.')
    }
  }

  return (
    <div className="employee-page admin-page">
      <div className="page-heading"><div><p className="page-eyebrow">Admin workspace</p><h2>User Management</h2></div></div>
      <AdminSectionNav />

      {isLoading ? <LoadingState /> : loadError ? (
        <ErrorState title="Users could not be loaded" message={loadError} />
      ) : (
        <>
          <section className="admin-editor" aria-labelledby="user-editor-title">
            <div className="admin-section-heading">
              <div><h3 id="user-editor-title">{editingId ? 'View and edit user' : 'Create user'}</h3><p>{editingId || 'Add a user and assign one or more roles.'}</p></div>
              {editingId && <button type="button" className="button button-secondary" onClick={resetEditor}>Cancel Edit</button>}
            </div>
            {message && <div className={Object.keys(errors).length ? 'form-alert admin-message' : 'form-success'} role="status">{message}</div>}
            <form className="admin-form-grid" onSubmit={handleSubmit} noValidate>
              <div className="field-group"><label htmlFor="admin-user-id">User ID</label><input id="admin-user-id" value={form.id} onChange={(event) => updateField('id', event.target.value)} disabled={Boolean(editingId)} aria-invalid={Boolean(errors.id)} />{errors.id && <p className="field-error">{errors.id}</p>}</div>
              <div className="field-group"><label htmlFor="admin-user-name">Name</label><input id="admin-user-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <p className="field-error">{errors.name}</p>}</div>
              <div className="field-group"><label htmlFor="admin-user-email">Email</label><input id="admin-user-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} aria-invalid={Boolean(errors.email)} />{errors.email && <p className="field-error">{errors.email}</p>}</div>
              <div className="field-group"><label htmlFor="admin-user-phone">Phone</label><input id="admin-user-phone" type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></div>
              <div className="field-group"><label htmlFor="admin-user-department">Department</label><select id="admin-user-department" value={form.departmentId} onChange={(event) => updateField('departmentId', event.target.value)} aria-invalid={Boolean(errors.departmentId)}><option value="">No department</option>{departments.filter((department) => department.active || department.id === form.departmentId).map((department) => <option value={department.id} key={department.id}>{department.name}{department.active ? '' : ' (Inactive)'}</option>)}</select>{errors.departmentId && <p className="field-error">{errors.departmentId}</p>}</div>
              {!editingId && <label className="admin-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /><span>Create as active</span></label>}
              <fieldset className="admin-role-field"><legend>Roles</legend><div className="admin-role-options">{USER_ROLES.map((role) => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} /><span>{role.replaceAll('_', ' ')}</span></label>)}</div>{errors.roles && <p className="field-error">{errors.roles}</p>}</fieldset>
              <div className="admin-form-action"><button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingId ? 'Save User' : 'Create User'}</button></div>
            </form>
          </section>

          <section className="admin-list-section" aria-labelledby="user-list-title">
            <div className="admin-section-heading"><div><h3 id="user-list-title">Users</h3><p>{filteredUsers.length} of {users.length} records</p></div></div>
            <div className="admin-filters admin-user-filters">
              <div className="field-group"><label htmlFor="admin-user-search">Search</label><input id="admin-user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone, or ID" /></div>
              <div className="field-group"><label htmlFor="admin-role-filter">Role</label><select id="admin-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="ALL">All roles</option>{USER_ROLES.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></div>
              <div className="field-group"><label htmlFor="admin-user-status">Status</label><select id="admin-user-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
            </div>
            <div className="request-table-wrap"><table className="request-table admin-table"><thead><tr><th>User</th><th>Department</th><th>Roles</th><th>Microsoft</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td data-label="User"><strong>{user.name}</strong><small>{user.email || user.id}{user.phone ? ` | ${user.phone}` : ''}</small></td><td data-label="Department">{user.departmentId ? departmentNames.get(user.departmentId) ?? user.departmentId : 'Not assigned'}</td><td data-label="Roles"><div className="role-tag-list">{user.roles.map((role) => <span key={role}>{role.replaceAll('_', ' ')}</span>)}</div></td><td data-label="Microsoft"><strong>{user.entraLinked ? 'Linked' : 'Not linked'}</strong>{user.entraPrincipalName && <small>{user.entraPrincipalName}</small>}</td><td data-label="Status"><ActiveBadge active={user.active} /></td><td data-label="Actions"><div className="table-actions"><button type="button" className="button button-secondary button-small" onClick={() => editUser(user)}>View / Edit</button><button type="button" className="button button-quiet button-small" onClick={() => toggleStatus(user)}>{user.active ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
    </div>
  )
}
