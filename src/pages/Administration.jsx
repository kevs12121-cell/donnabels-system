import { useState } from 'react'
import { Edit3, KeyRound, Plus, Power } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../hooks/useLoader'
import { DataTable, Field, IconButton, Modal, Notice, PageHeader, SearchInput, StatusBadge } from '../components/ui'
import { formatDate, formatDateTime, fullName, roleLabel } from '../utils/format'

const EMPLOYEE_FIELDS = [
  ['employee_code', 'Employee code', true], ['position', 'Position', true],
  ['first_name', 'First name', true], ['middle_name', 'Middle name'], ['last_name', 'Last name', true],
  ['phone', 'Phone', false, 'tel'], ['email', 'Email', false, 'email'], ['hire_date', 'Hire date', false, 'date'],
]

export function Employees() {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useLoader(async () => (await api.get('/employees')).data.data, [], [])
  const rows = data.filter((row) => `${row.employee_code} ${fullName(row)} ${row.position} ${row.username || ''}`.toLowerCase().includes(query.toLowerCase()))

  async function toggle(row) {
    setError('')
    try {
      await api.patch(`/employees/${row.id}/status`, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      setMessage(`${fullName(row)} is now ${row.status === 'ACTIVE' ? 'inactive and cannot sign in' : 'active'}.`)
      reload()
    } catch (err) { setError(errorMessage(err)) }
  }

  const columns = [
    { key: 'name', label: 'Employee', primary: true, render: (row) => <><strong>{[row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')}</strong><small>{row.employee_code}</small></> },
    { key: 'position', label: 'Position' },
    { key: 'contact', label: 'Contact', render: (row) => <span className="cell-stack"><span>{row.phone || '—'}</span><small>{row.email || ''}</small></span> },
    { key: 'hire_date', label: 'Hired', render: (row) => formatDate(row.hire_date) },
    { key: 'account', label: 'System access', render: (row) => (row.username ? <span className="cell-stack"><span>{row.username}</span><small>{roleLabel(row.account_role)}</small></span> : <span className="muted-text">No account</span>) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label={`Edit ${fullName(row)}`} onClick={() => setEditing(row)}><Edit3 size={16} /></IconButton>
        <IconButton label={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} className={row.status === 'ACTIVE' ? 'danger' : ''} onClick={() => toggle(row)}><Power size={16} /></IconButton>
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader kicker="People" title="Employees" description="The team behind Donz Flower Shop. Deactivating an employee also blocks their sign-in."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add employee</button>} />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{error || loadError}</Notice>
      <section className="panel panel-flush">
        <div className="toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search name, position or code" /><span className="result-count">{rows.length} employees</span></div>
        <DataTable columns={columns} rows={rows} loading={loading} caption="Employees" />
      </section>
      {editing && <EmployeeForm employee={editing} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMessage(text); reload() }} />}
    </div>
  )
}

function EmployeeForm({ employee, onClose, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(EMPLOYEE_FIELDS.map(([key]) => [key, employee[key] ?? ''])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (employee.id) await api.put(`/employees/${employee.id}`, form)
      else await api.post('/employees', form)
      onSaved(`${form.first_name} ${form.last_name} was ${employee.id ? 'updated' : 'added'}.`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the employee.'))
      setBusy(false)
    }
  }
  return (
    <Modal title={employee.id ? 'Edit employee' : 'Add employee'} kicker="Staff record" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          {EMPLOYEE_FIELDS.map(([key, label, required, type]) => (
            <Field key={key} label={required ? label : `${label} (optional)`}>
              <input type={type || 'text'} required={required} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </Field>
          ))}
        </div>
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : employee.id ? 'Save changes' : 'Add employee'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function Users() {
  const { user: me } = useAuth()
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useLoader(async () => {
    const [users, employees] = await Promise.all([api.get('/admin/users'), api.get('/employees')])
    return { users: users.data.data, employees: employees.data.data }
  }, [], { users: [], employees: [] })

  async function toggle(row) {
    setError('')
    try {
      await api.patch(`/admin/users/${row.id}/status`, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      setMessage(`Account ${row.username} is now ${row.status === 'ACTIVE' ? 'inactive' : 'active'}.`)
      reload()
    } catch (err) { setError(errorMessage(err)) }
  }

  const columns = [
    { key: 'username', label: 'Account', primary: true, render: (row) => <><strong>{row.username}{row.id === me?.id ? ' (you)' : ''}</strong><small>{fullName(row) || 'No linked employee'}{row.position ? ` · ${row.position}` : ''}</small></> },
    { key: 'role', label: 'Role', render: (row) => <StatusBadge status={row.role} /> },
    { key: 'last_login', label: 'Last sign-in', render: (row) => (row.lastLogin ? formatDateTime(row.lastLogin) : 'Never') },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label={`Edit ${row.username}`} onClick={() => setEditing(row)}><Edit3 size={16} /></IconButton>
        <IconButton label={row.status === 'ACTIVE' ? 'Deactivate account' : 'Activate account'} className={row.status === 'ACTIVE' ? 'danger' : ''} disabled={row.id === me?.id} onClick={() => toggle(row)}><Power size={16} /></IconButton>
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader kicker="Access control" title="User accounts" description="Give staff their own sign-in. Cashiers run the register; owners also manage reports, people and settings."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Create account</button>} />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{error || loadError}</Notice>
      <section className="panel panel-flush">
        <DataTable columns={columns} rows={data.users} loading={loading} caption="User accounts" />
      </section>
      {editing && <UserForm account={editing} users={data.users} employees={data.employees} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMessage(text); reload() }} />}
    </div>
  )
}

function UserForm({ account, users, employees, onClose, onSaved }) {
  const [form, setForm] = useState({ employeeId: account.employeeId ? String(account.employeeId) : '', username: account.username || '', role: account.role || 'EMPLOYEE', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const taken = new Set(users.filter((item) => item.id !== account.id).map((item) => item.employeeId))
  const options = employees.filter((employee) => !taken.has(employee.id) && (employee.status === 'ACTIVE' || employee.id === account.employeeId))

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (account.id) await api.put(`/admin/users/${account.id}`, form)
      else await api.post('/admin/users', form)
      onSaved(`Account ${form.username} was ${account.id ? 'updated' : 'created'}.`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the account.'))
      setBusy(false)
    }
  }

  return (
    <Modal title={account.id ? `Edit ${account.username}` : 'Create account'} kicker="Secure access" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Employee" wide>
            <select required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
              <option value="">Select employee</option>
              {options.map((employee) => <option key={employee.id} value={employee.id}>{fullName(employee)} — {employee.position}</option>)}
            </select>
          </Field>
          <Field label="Username"><input required minLength={3} autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="EMPLOYEE">Cashier</option>
              <option value="OWNER">Owner</option>
            </select>
          </Field>
          <Field label={account.id ? 'New password' : 'Password'} wide hint={account.id ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}>
            <span className="input-icon"><KeyRound size={16} aria-hidden="true" /><input type="password" autoComplete="new-password" required={!account.id} minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></span>
          </Field>
        </div>
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : account.id ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  )
}
