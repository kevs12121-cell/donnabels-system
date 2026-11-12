const pad = (value) => String(value).padStart(2, '0')

export function money(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function compactMoney(value) {
  const number = Number(value || 0)
  if (Math.abs(number) >= 1_000_000) return `₱${(number / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(number) >= 10_000) return `₱${(number / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `₱${number.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

export function quantity(value) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })
}

export function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

/** YYYY-MM-DD for the browser's local day. */
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function shiftDays(days, from = new Date()) {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return date
}

// Server dates are shop-local wall-clock strings ("2026-11-12" or "2026-11-12 19:26:53").
function parse(value) {
  if (!value) return null
  const text = String(value)
  const date = new Date(text.length === 10 ? `${text}T00:00:00` : text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
  const date = parse(value)
  return date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

export function formatDateTime(value) {
  const date = parse(value)
  return date ? date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
}

export function formatTime(value) {
  const date = parse(value)
  return date ? date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—'
}

export function weekday(value) {
  const date = parse(value)
  return date ? date.toLocaleDateString('en-PH', { weekday: 'short' }) : ''
}

export const roleLabel = (role) => (role === 'OWNER' ? 'Owner' : 'Cashier')

const METHOD_LABELS = { CASH: 'Cash', GCASH: 'GCash', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', OTHER: 'Other' }
export const PAYMENT_METHODS = Object.keys(METHOD_LABELS)
export const methodLabel = (method) => (method ? String(method).split(',').map((item) => METHOD_LABELS[item] || item).join(', ') : '—')

export const EXPENSE_CATEGORIES = ['Utilities', 'Transportation', 'Supplies', 'Rent', 'Maintenance', 'Packaging', 'Other']

export function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function fullName(row) {
  return [row?.first_name ?? row?.firstName, row?.last_name ?? row?.lastName].filter(Boolean).join(' ')
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
