import { useEffect, useState } from 'react'
import { KeyRound, Store, UserRound } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useDebounced, useLoader } from '../hooks/useLoader'
import { DataTable, Field, Notice, PageHeader, Pagination, SearchInput, StatusBadge } from '../components/ui'
import { formatDateTime, localDate, roleLabel, shiftDays, titleCase } from '../utils/format'

const ACTION_TONES = { VOIDED: 'VOIDED', CANCELLED: 'CANCELLED', DEACTIVATED: 'INACTIVE', LOGIN: 'EMPLOYEE', LOGOUT: 'INACTIVE' }

export function ActivityLogs() {
  const [query, setQuery] = useState('')
  const [module, setModule] = useState('')
  const [days, setDays] = useState('7')
  const [page, setPage] = useState(1)
  const search = useDebounced(query)
  const startDate = days ? localDate(shiftDays(-(Number(days) - 1))) : undefined
  const { data, loading, error } = useLoader(
    async () => (await api.get('/admin/activity-logs', { params: { page, limit: 25, search: search || undefined, module: module || undefined, startDate } })).data.data,
    [page, search, module, days],
    { rows: [], modules: [], pagination: {} },
  )
  const reset = (setter) => (value) => { setter(value); setPage(1) }

  const columns = [
    { key: 'description', label: 'Event', primary: true, render: (row) => <><strong>{row.description}</strong><small>{formatDateTime(row.created_at)}</small></> },
    { key: 'user', label: 'User', render: (row) => <span className="cell-stack"><span>{row.user_name || row.username || 'System'}</span><small>{row.role ? roleLabel(row.role) : ''}</small></span> },
    { key: 'action', label: 'Action', render: (row) => <StatusBadge status={ACTION_TONES[row.action] || 'ACTIVE'} label={titleCase(row.action)} /> },
    { key: 'module', label: 'Module', render: (row) => titleCase(row.module) },
    { key: 'ip', label: 'IP address', hideOnMobile: true, render: (row) => <code>{row.ip_address || '—'}</code> },
  ]

  return (
    <div>
      <PageHeader kicker="Audit trail" title="Activity logs" description="A read-only, chronological record of sign-ins and every important change in the system." />
      <Notice>{error}</Notice>
      <section className="panel panel-flush">
        <div className="toolbar">
          <SearchInput value={query} onChange={reset(setQuery)} placeholder="Search events, users or codes" />
          <select value={module} onChange={(event) => reset(setModule)(event.target.value)} aria-label="Module"><option value="">All modules</option>{data.modules.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select>
          <select value={days} onChange={(event) => reset(setDays)(event.target.value)} aria-label="Period"><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="">All time</option></select>
        </div>
        <DataTable columns={columns} rows={data.rows} loading={loading} caption="Activity logs" />
        <Pagination page={data.pagination.page || 1} pages={data.pagination.pages || 1} total={data.pagination.total} onChange={setPage} noun="events" />
      </section>
    </div>
  )
}

const SHOP_FIELDS = [['shop_name', 'Shop name', true], ['phone', 'Phone'], ['email', 'Email', false, 'email'], ['address', 'Address', false, 'textarea'], ['receipt_footer', 'Receipt footer message', false, 'textarea']]

export function Settings() {
  const { user, isOwner } = useAuth()
  const [shop, setShop] = useState({})
  const [shopState, setShopState] = useState({ busy: false, message: '', error: '' })
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordState, setPasswordState] = useState({ busy: false, message: '', error: '' })

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => setShop(data.data)).catch((err) => setShopState((state) => ({ ...state, error: errorMessage(err) })))
  }, [])

  async function saveShop(event) {
    event.preventDefault()
    setShopState({ busy: true, message: '', error: '' })
    try {
      const payload = Object.fromEntries(SHOP_FIELDS.map(([key]) => [key, shop[key] ?? '']))
      await api.put('/admin/settings', payload)
      setShopState({ busy: false, message: 'Shop profile saved. Receipts will use the new details.', error: '' })
    } catch (err) {
      setShopState({ busy: false, message: '', error: errorMessage(err, 'Unable to save settings.') })
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (password.newPassword !== password.confirmPassword) {
      setPasswordState({ busy: false, message: '', error: 'New passwords do not match.' })
      return
    }
    setPasswordState({ busy: true, message: '', error: '' })
    try {
      await api.post('/auth/change-password', password)
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordState({ busy: false, message: 'Password changed. Use it the next time you sign in.', error: '' })
    } catch (err) {
      setPasswordState({ busy: false, message: '', error: errorMessage(err, 'Unable to change password.') })
    }
  }

  return (
    <div>
      <PageHeader kicker="Preferences" title="Settings" description={isOwner ? 'Shop details used on receipts, and your account security.' : 'Your account details and password. Shop details are managed by the owner.'} />
      <div className="settings-grid">
        <form className="panel" onSubmit={saveShop}>
          <div className="panel-header"><div><p className="kicker">Business information</p><h3>Shop profile</h3></div><Store size={18} className="panel-icon" aria-hidden="true" /></div>
          <fieldset disabled={!isOwner} className="form-grid">
            {SHOP_FIELDS.map(([key, label, required, type]) => (
              <Field key={key} label={label} wide={type === 'textarea' || key === 'shop_name'}>
                {type === 'textarea'
                  ? <textarea rows={2} value={shop[key] || ''} onChange={(event) => setShop({ ...shop, [key]: event.target.value })} />
                  : <input type={type || 'text'} required={required} value={shop[key] || ''} onChange={(event) => setShop({ ...shop, [key]: event.target.value })} />}
              </Field>
            ))}
          </fieldset>
          {shopState.message && <Notice type="success">{shopState.message}</Notice>}
          <Notice>{shopState.error}</Notice>
          {isOwner ? <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={shopState.busy}>{shopState.busy ? 'Saving…' : 'Save shop profile'}</button></div> : <p className="field-hint">Only the owner can edit the shop profile.</p>}
        </form>

        <div className="stack">
          <section className="panel">
            <div className="panel-header"><div><p className="kicker">Signed in as</p><h3>My account</h3></div><UserRound size={18} className="panel-icon" aria-hidden="true" /></div>
            <dl className="detail-grid">
              <div><dt>Name</dt><dd>{user?.firstName} {user?.lastName}</dd></div>
              <div><dt>Username</dt><dd>{user?.username}</dd></div>
              <div><dt>Role</dt><dd><StatusBadge status={user?.role} /></dd></div>
              <div><dt>Position</dt><dd>{user?.position || '—'}</dd></div>
            </dl>
          </section>
          <form className="panel" onSubmit={changePassword}>
            <div className="panel-header"><div><p className="kicker">Account security</p><h3>Change password</h3></div><KeyRound size={18} className="panel-icon" aria-hidden="true" /></div>
            <div className="stack">
              <Field label="Current password"><input required type="password" autoComplete="current-password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} /></Field>
              <Field label="New password" hint="At least 8 characters."><input required minLength={8} type="password" autoComplete="new-password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} /></Field>
              <Field label="Confirm new password"><input required minLength={8} type="password" autoComplete="new-password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} /></Field>
            </div>
            {passwordState.message && <Notice type="success">{passwordState.message}</Notice>}
            <Notice>{passwordState.error}</Notice>
            <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={passwordState.busy}>{passwordState.busy ? 'Updating…' : 'Change password'}</button></div>
          </form>
        </div>
      </div>
    </div>
  )
}
