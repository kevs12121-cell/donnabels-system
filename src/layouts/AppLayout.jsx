import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Boxes, ClipboardList, Flower2, History, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, ShoppingBag, Tags, Truck, UserCog, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Loader } from '../components/ui'
import { roleLabel } from '../utils/format'

const NAVIGATION = [
  ['Overview', [['Dashboard', '/dashboard', LayoutDashboard]]],
  ['Operations', [['Sales & POS', '/sales', ShoppingBag], ['Inventory', '/inventory', Boxes], ['Purchases', '/purchases', ClipboardList], ['Expenses', '/expenses', Receipt]]],
  ['Catalog', [['Products', '/products', Package], ['Categories', '/categories', Tags], ['Suppliers', '/suppliers', Truck]]],
  ['Management', [['Reports', '/reports', BarChart3], ['Employees', '/employees', Users], ['User accounts', '/users', UserCog], ['Activity logs', '/activity-logs', History]], 'OWNER'],
  ['Account', [['Settings', '/settings', Settings]]],
]
const TITLES = Object.fromEntries(NAVIGATION.flatMap(([, items]) => items.map(([label, path]) => [path, label])))

export default function AppLayout() {
  const { user, logout, isOwner } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const title = TITLES[location.pathname] || 'Dashboard'

  useEffect(() => { document.title = `${title} · Donz Flower Shop` }, [title])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const initials = `${user?.firstName?.[0] || user?.username?.[0] || 'D'}${user?.lastName?.[0] || ''}`.toUpperCase()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark"><Flower2 size={19} aria-hidden="true" /></span>
          <span className="brand-text"><strong>DONZ</strong><small>Flower Shop</small></span>
          <button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav>
          {NAVIGATION.filter(([, , role]) => !role || (role === 'OWNER' && isOwner)).map(([group, items]) => (
            <div className="nav-group" key={group}>
              <div className="nav-label">{group}</div>
              {items.map(([label, path, Icon]) => (
                <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                  <Icon size={18} aria-hidden="true" /><span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Signed in as <strong>{roleLabel(user?.role)}</strong></span>
        </div>
      </aside>
      {open && <button type="button" className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}

      <div className="main-shell">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu size={21} /></button>
          <div className="topbar-title">
            <div className="eyebrow">Donz Flower Shop</div>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <div className="user-chip">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span className="user-meta"><strong>{user?.firstName} {user?.lastName}</strong><small>{roleLabel(user?.role)}</small></span>
            </div>
            <button type="button" className="btn btn-ghost signout-btn" onClick={logout} aria-label="Sign out"><LogOut size={17} /><span>Sign out</span></button>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          <Suspense fallback={<Loader label="Loading page…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
