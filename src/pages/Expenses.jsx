import { useState } from 'react'
import { Ban, Edit3, Plus, RotateCcw } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useDebounced, useLoader } from '../hooks/useLoader'
import { ConfirmDialog, DataTable, Field, IconButton, Modal, Notice, PageHeader, SearchInput, StatusBadge } from '../components/ui'
import { EXPENSE_CATEGORIES, formatDate, localDate, methodLabel, money, PAYMENT_METHODS, shiftDays } from '../utils/format'

const PERIODS = {
  month: ['This month', () => `${localDate().slice(0, 8)}01`],
  last30: ['Last 30 days', () => localDate(shiftDays(-29))],
  last90: ['Last 90 days', () => localDate(shiftDays(-89))],
  all: ['All time', () => undefined],
}

export default function Expenses() {
  const { isOwner } = useAuth()
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState('month')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [message, setMessage] = useState('')
  const search = useDebounced(query)
  const { data, loading, error, reload } = useLoader(
    async () => (await api.get('/expenses', { params: { search: search || undefined, category: category || undefined, status: status || undefined, startDate: PERIODS[period][1]() } })).data.data,
    [search, period, category, status],
    [],
  )
  const active = data.filter((row) => row.status === 'ACTIVE')
  const total = active.reduce((sum, row) => sum + Number(row.amount), 0)
  const today = localDate()
  const todayTotal = active.filter((row) => row.expense_date === today).reduce((sum, row) => sum + Number(row.amount), 0)

  const askStatus = (row) => {
    const voiding = row.status === 'ACTIVE'
    setConfirm({
      title: `${voiding ? 'Void' : 'Restore'} ${row.expense_code}?`,
      message: voiding ? `The ${money(row.amount)} expense will be excluded from totals and reports.` : 'The expense will count toward totals and reports again.',
      confirmLabel: voiding ? 'Void expense' : 'Restore expense',
      tone: voiding ? 'danger' : 'primary',
      onConfirm: async () => { await api.patch(`/expenses/${row.id}/status`, { status: voiding ? 'VOIDED' : 'ACTIVE' }); setMessage(`${row.expense_code} was ${voiding ? 'voided' : 'restored'}.`); reload() },
    })
  }

  const columns = [
    { key: 'expense', label: 'Expense', primary: true, render: (row) => <><strong>{row.description}</strong><small>{row.expense_code}</small></> },
    { key: 'category', label: 'Category', render: (row) => row.category },
    { key: 'date', label: 'Date', render: (row) => formatDate(row.expense_date) },
    { key: 'method', label: 'Paid via', render: (row) => methodLabel(row.payment_method) },
    { key: 'by', label: 'Recorded by', hideOnMobile: true, render: (row) => row.created_by_name },
    { key: 'amount', label: 'Amount', align: 'right', render: (row) => <strong className={row.status === 'VOIDED' ? 'text-strike' : ''}>{money(row.amount)}</strong> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    ...(isOwner ? [{ key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        {row.status === 'ACTIVE' && <IconButton label="Edit expense" onClick={() => setEditing(row)}><Edit3 size={16} /></IconButton>}
        <IconButton label={row.status === 'ACTIVE' ? 'Void expense' : 'Restore expense'} className={row.status === 'ACTIVE' ? 'danger' : ''} onClick={() => askStatus(row)}>{row.status === 'ACTIVE' ? <Ban size={16} /> : <RotateCcw size={16} />}</IconButton>
      </div>
    ) }] : []),
  ]

  return (
    <div>
      <PageHeader
        kicker="Cash control"
        title="Expenses"
        description={isOwner ? 'Track the everyday costs of running the shop.' : 'Record shop costs you paid for. The owner reviews, edits, and voids entries.'}
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Record expense</button>}
      />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{error}</Notice>
      <div className="mini-stats">
        <div><span>{PERIODS[period][0]}</span><strong>{money(total)}</strong></div>
        <div><span>Today</span><strong>{money(todayTotal)}</strong></div>
        <div><span>Active entries</span><strong>{active.length}</strong></div>
      </div>
      <section className="panel panel-flush">
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search description or code" />
          <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Period">{Object.entries(PERIODS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category"><option value="">All categories</option>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="VOIDED">Voided</option></select>
        </div>
        <DataTable columns={columns} rows={data} loading={loading} caption="Expenses" />
      </section>
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMessage(text); reload() }} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}

function ExpenseForm({ expense, onClose, onSaved }) {
  const [form, setForm] = useState({
    category: expense.category || 'Supplies',
    description: expense.description || '',
    amount: expense.amount ? String(Number(expense.amount)) : '',
    expenseDate: expense.expense_date || localDate(),
    paymentMethod: expense.payment_method || 'CASH',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (expense.id) await api.put(`/expenses/${expense.id}`, form)
      else await api.post('/expenses', form)
      onSaved(`Expense ${expense.id ? 'updated' : 'recorded'}: ${form.description} (${money(form.amount)}).`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the expense.'))
      setBusy(false)
    }
  }

  return (
    <Modal title={expense.id ? 'Edit expense' : 'Record expense'} kicker="Operating cost" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Category"><select value={form.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Amount (₱)"><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={set('amount')} /></Field>
          <Field label="Date"><input required type="date" max={localDate()} value={form.expenseDate} onChange={set('expenseDate')} /></Field>
          <Field label="Paid via"><select value={form.paymentMethod} onChange={set('paymentMethod')}>{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{methodLabel(item)}</option>)}</select></Field>
          <Field label="Description" wide><textarea required rows={3} value={form.description} onChange={set('description')} placeholder="e.g. Delivery van fuel" /></Field>
        </div>
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : expense.id ? 'Save changes' : 'Record expense'}</button>
        </div>
      </form>
    </Modal>
  )
}
