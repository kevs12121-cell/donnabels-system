import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Boxes, ClipboardList, FileText, Flower2, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingBag, Truck, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const navigation = [
  ['Dashboard', '/dashboard', LayoutDashboard, 'all'], ['Sales', '/sales', ShoppingBag, 'all'], ['Products', '/products', Package, 'all'], ['Inventory', '/inventory', Boxes, 'all'], ['Purchases', '/purchases', ClipboardList, 'all'], ['Suppliers', '/suppliers', Truck, 'all'], ['Expenses', '/expenses', FileText, 'all'], ['Reports', '/reports', BarChart3, 'OWNER'], ['Employees', '/employees', Users, 'OWNER'], ['Users', '/users', Users, 'OWNER'], ['Activity Logs', '/activity-logs', ClipboardList, 'OWNER'], ['Settings', '/settings', Settings, 'all'],
]
const titles = Object.fromEntries(navigation.map(([label, path]) => [path, label]))
export default function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const title = titles[location.pathname] || 'Dashboard'
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Flower2 size={19} /></span><span><strong>DONZ</strong><small>FLOWER SHOP</small></span><button className="icon-btn mobile-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={19} /></button></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{navigation.filter(([, , , role]) => role === 'all' || role === user?.role).map(([label, path, Icon]) => <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="status-dot" /> <span>Operations online</span></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <main className="main-shell">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div><div className="eyebrow">INTERNAL OPERATIONS / {title.toUpperCase()}</div><h1>{title}</h1></div><div className="topbar-actions"><div className="user-chip"><span className="avatar">{user?.firstName?.[0] || 'D'}</span><span><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.role}</small></span></div><button className="logout-btn" onClick={logout}><LogOut size={17} /><span>Sign out</span></button></div></header>
      <section className="content"><Outlet /></section>
    </main>
  </div>
}
