import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, Loader2, Search, X } from 'lucide-react'

export function PageHeader({ kicker, title, description, actions }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {kicker && <p className="kicker">{kicker}</p>}
        <h2>{title}</h2>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

const NOTICE_ICONS = { error: AlertTriangle, success: CheckCircle2, info: Info }

export function Notice({ type = 'error', children, onClose }) {
  if (!children) return null
  const Icon = NOTICE_ICONS[type] || Info
  return (
    <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={17} aria-hidden="true" />
      <div className="notice-body">{children}</div>
      {onClose && <button type="button" className="notice-close" onClick={onClose} aria-label="Dismiss message"><X size={15} /></button>}
    </div>
  )
}

const STATUS_TONES = {
  ACTIVE: 'good', RECEIVED: 'good', COMPLETED: 'good', PAID: 'good', 'IN STOCK': 'good',
  PENDING: 'warn', 'LOW STOCK': 'warn', PARTIAL: 'warn',
  INACTIVE: 'muted', CANCELLED: 'bad', VOIDED: 'bad', 'OUT OF STOCK': 'bad', UNPAID: 'bad',
  OWNER: 'brand', EMPLOYEE: 'info',
}
const STATUS_LABELS = { EMPLOYEE: 'Cashier', OWNER: 'Owner' }

export function StatusBadge({ status, label }) {
  const tone = STATUS_TONES[status] || 'muted'
  const text = label || STATUS_LABELS[status] || String(status || '').toLowerCase().replace(/(^|\s)\w/g, (letter) => letter.toUpperCase())
  return <span className={`badge badge-${tone}`}><i aria-hidden="true" />{text}</span>
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing to show yet', message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} aria-hidden="true" /></span>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

export function Loader({ label = 'Loading…' }) {
  return <div className="loader" role="status"><Loader2 size={18} className="spin" aria-hidden="true" /><span>{label}</span></div>
}

export function SearchInput({ value, onChange, placeholder = 'Search', label }) {
  return (
    <label className="search-input">
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">{label || placeholder}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search"><X size={14} /></button>}
    </label>
  )
}

export function Pagination({ page, pages, total, onChange, noun = 'records' }) {
  if (!total) return null
  return (
    <div className="pagination">
      <span className="pagination-info">{total.toLocaleString()} {noun}</span>
      <div className="pagination-controls">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /> <span>Prev</span></button>
        <span className="pagination-page">Page {page} of {pages}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}><span>Next</span> <ChevronRight size={15} /></button>
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone, to, onClick }) {
  const content = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon"><Icon size={17} aria-hidden="true" /></span>}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </>
  )
  const className = `stat-card ${tone ? `stat-${tone}` : ''} ${to || onClick ? 'is-link' : ''}`
  if (onClick) return <button type="button" className={className} onClick={onClick}>{content}</button>
  if (to) return <Link className={className} to={to}>{content}</Link>
  return <article className={className}>{content}</article>
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(([key, text, count]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'tab active' : 'tab'} onClick={() => onChange(key)}>
          {text}{count !== undefined && <span className="tab-count">{count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * Responsive table: a normal table on wide screens, stacked cards on phones.
 * columns: [{ key, label, render(row), align, primary, actions, hideOnMobile }]
 */
export function DataTable({ columns, rows, rowKey = 'id', empty, loading, caption, footer }) {
  return (
    <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>{columns.map((column) => <th key={column.key} scope="col" className={column.align ? `align-${column.align}` : undefined}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row[rowKey] ?? index}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.actions || column.primary ? undefined : column.label}
                  className={[column.align && `align-${column.align}`, column.primary && 'cell-primary', column.actions && 'cell-actions', column.hideOnMobile && 'hide-mobile'].filter(Boolean).join(' ') || undefined}
                >
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
      {!rows.length && (loading ? <Loader /> : (empty || <EmptyState title="No records found" message="Try adjusting your search or filters." />))}
    </div>
  )
}

export function Modal({ title, kicker, onClose, children, footer, size = 'md', className = '' }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    const focusable = panelRef.current?.querySelector('input:not([type=hidden]), select, textarea, button:not(.modal-close)')
    ;(focusable || panelRef.current)?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
      previous?.focus?.()
    }
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div ref={panelRef} className={`modal modal-${size} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-header">
          <div>
            {kicker && <p className="kicker">{kicker}</p>}
            <h3 id={titleId}>{title}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/** Confirmation dialog with an optional reason field. onConfirm(reason) may be async and throw. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'primary', reasonLabel, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Action failed. Please try again.')
      setBusy(false)
    }
  }
  return (
    <Modal title={title} onClose={busy ? undefined : onClose} size="sm">
      <form onSubmit={confirm} className="stack">
        <p className="confirm-message">{message}</p>
        {reasonLabel && <Field label={reasonLabel}><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Optional" /></Field>}
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Keep it</button>
          <button type="submit" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

export function Field({ label, children, wide, hint, className = '' }) {
  return (
    <label className={`field ${wide ? 'field-wide' : ''} ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function IconButton({ label, children, className = '', ...props }) {
  return <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>{children}</button>
}
