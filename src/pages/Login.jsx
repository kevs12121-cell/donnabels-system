import { useEffect, useState } from 'react'
import { Eye, EyeOff, Flower2, LockKeyhole, UserRound } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../services/api'
import { Notice } from '../components/ui'

const DEMO_ACCOUNTS = [
  ['owner', 'Owner', 'Full access: reports, staff, settings'],
  ['cashier', 'Cashier', 'Point of sale and daily operations'],
]

export default function Login() {
  const { user, login, sessionExpired } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(false)

  useEffect(() => { api.get('/health').then(({ data }) => setDemo(Boolean(data.data?.demo))).catch(() => {}) }, [])

  if (user) return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(form)
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in right now.'))
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <section className="login-aside">
        <div className="login-brand">
          <span className="brand-mark"><Flower2 size={21} aria-hidden="true" /></span>
          <span className="brand-text"><strong>DONZ</strong><small>Flower Shop</small></span>
        </div>
        <div className="aside-copy">
          <p className="kicker">Shop operations</p>
          <h1>Make every stem <em>count.</em></h1>
          <p>Sales, stock, suppliers and reports in one calm workspace for the people who keep Donz Flower Shop blooming.</p>
        </div>
        <div className="aside-note">Internal management system · {new Date().getFullYear()}</div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="kicker">Welcome back</p>
          <h2>Sign in to your workspace</h2>
          <p className="login-subtitle">Use your Donz staff account to continue.</p>
          {sessionExpired && <Notice type="info">Your session ended. Please sign in again.</Notice>}
          <form onSubmit={submit} className="login-form">
            <label className="field">
              <span className="field-label">Username</span>
              <span className="input-icon"><UserRound size={17} aria-hidden="true" /><input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Enter username" required /></span>
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <span className="input-icon">
                <LockKeyhole size={17} aria-hidden="true" />
                <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter password" required />
                <button type="button" className="input-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </span>
            </label>
            <Notice>{error}</Notice>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Checking account…' : 'Sign in'}</button>
          </form>

          {demo && (
            <div className="demo-accounts">
              <p>Demo accounts <span>password: <code>password</code></span></p>
              <div>
                {DEMO_ACCOUNTS.map(([username, label, hint]) => (
                  <button key={username} type="button" onClick={() => setForm({ username, password: 'password' })}>
                    <strong>{label}</strong><small>{username} · {hint}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="login-foot">Authorized Donz Flower Shop personnel only.</p>
        </div>
      </section>
    </div>
  )
}
