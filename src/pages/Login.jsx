import { useState } from 'react'
import { Flower2, LockKeyhole, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'

export default function Login() {
  const { user, login } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/dashboard" replace />
  async function submit(event) { event.preventDefault(); setError(''); setBusy(true); try { await login(form) } catch (err) { setError(err.response?.data?.message || 'Unable to sign in right now.') } finally { setBusy(false) } }
  return <div className="login-screen"><div className="login-aside"><div className="login-brand"><span className="brand-mark"><Flower2 size={21} /></span><span><strong>DONZ</strong><small>FLOWER SHOP</small></span></div><div className="aside-copy"><p className="kicker">SHOP OPERATIONS</p><h1>Make every stem<br /><em>count.</em></h1><p>A focused workspace for the people who keep Donz Flower Shop moving beautifully.</p></div><div className="aside-note">INTERNAL MANAGEMENT SYSTEM <span>•</span> 2026</div></div><div className="login-panel"><div className="login-form-wrap"><p className="kicker">WELCOME BACK</p><h2>Sign in to your workspace</h2><p className="login-subtitle">Use your Donz staff account to continue.</p><form onSubmit={submit}><label>Username<div className="input-wrap"><UserRound size={17} /><input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Enter username" required /></div></label><label>Password<div className="input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter password" required /></div></label>{error && <div className="form-error">{error}</div>}<button className="primary-btn" disabled={busy}>{busy ? 'Checking account...' : 'Sign in'} <span>→</span></button></form><p className="login-foot">Authorized Donz Flower Shop personnel only.</p></div></div></div>
}
