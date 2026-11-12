import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, History, SlidersHorizontal } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useDebounced, useLoader } from '../hooks/useLoader'
import { DataTable, EmptyState, Field, IconButton, Loader, Modal, Notice, PageHeader, SearchInput, StatusBadge } from '../components/ui'
import { formatDateTime, money, quantity, titleCase } from '../utils/format'

const STATUSES = ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK']

export default function Inventory() {
  const { isOwner } = useAuth()
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(STATUSES.includes(params.get('status')) ? params.get('status') : '')
  const [categoryId, setCategoryId] = useState('')
  const [adjusting, setAdjusting] = useState(null)
  const [historyFor, setHistoryFor] = useState(null)
  const [message, setMessage] = useState('')
  const search = useDebounced(query)
  const categories = useLoader(async () => (await api.get('/categories')).data.data, [], [])
  const inventory = useLoader(async () => (await api.get('/inventory', { params: { search, status: status || undefined, categoryId: categoryId || undefined } })).data.data, [search, status, categoryId], [])
  const rows = inventory.data
  const counts = { low: rows.filter((row) => row.stock_status === 'LOW STOCK').length, out: rows.filter((row) => row.stock_status === 'OUT OF STOCK').length }
  const value = rows.reduce((sum, row) => sum + Number(row.stock_value || 0), 0)

  const columns = [
    { key: 'product', label: 'Product', primary: true, render: (row) => <><strong>{row.product_name}</strong><small>{row.product_code} · {row.category_name}</small></> },
    { key: 'on_hand', label: 'On hand', align: 'right', render: (row) => <strong className={row.stock_status === 'OUT OF STOCK' ? 'text-danger' : row.stock_status === 'LOW STOCK' ? 'text-warn' : ''}>{quantity(row.stock_quantity)} {row.unit}</strong> },
    { key: 'reorder', label: 'Reorder at', align: 'right', render: (row) => quantity(row.reorder_level) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.stock_status} /> },
    ...(isOwner ? [{ key: 'value', label: 'Value at cost', align: 'right', hideOnMobile: true, render: (row) => money(row.stock_value) }] : []),
    { key: 'last', label: 'Last movement', hideOnMobile: true, render: (row) => formatDateTime(row.last_movement) },
    { key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label={`Movement history for ${row.product_name}`} onClick={() => setHistoryFor(row)}><History size={16} /></IconButton>
        <IconButton label={`Adjust ${row.product_name}`} onClick={() => setAdjusting(row)}><SlidersHorizontal size={16} /></IconButton>
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader
        kicker="Stock control"
        title="Inventory"
        description="Live quantities for every product. Every change is recorded with a reason and who made it."
        actions={<button type="button" className="btn btn-primary" onClick={() => setAdjusting({})}><SlidersHorizontal size={16} /> Adjust stock</button>}
      />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{inventory.error}</Notice>
      <div className="mini-stats">
        <div><span>Products shown</span><strong>{rows.length}</strong></div>
        <div><span>Low stock</span><strong className={counts.low ? 'text-warn' : ''}>{counts.low}</strong></div>
        <div><span>Out of stock</span><strong className={counts.out ? 'text-danger' : ''}>{counts.out}</strong></div>
        {isOwner && <div><span>Stock value (cost)</span><strong>{money(value)}</strong></div>}
      </div>
      <section className="panel panel-flush">
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search product or code" />
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Category"><option value="">All categories</option>{categories.data.map((item) => <option key={item.id} value={item.id}>{item.category_name}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Stock status"><option value="">All stock levels</option>{STATUSES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={rows} loading={inventory.loading} caption="Inventory" />
      </section>
      {adjusting && <AdjustForm product={adjusting} products={rows} onClose={() => setAdjusting(null)} onSaved={(text) => { setAdjusting(null); setMessage(text); inventory.reload() }} />}
      {historyFor && <MovementHistory product={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  )
}

function AdjustForm({ product, products, onClose, onSaved }) {
  const [form, setForm] = useState({ productId: product.id ? String(product.id) : '', adjustmentType: 'INCREASE', quantity: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = products.find((item) => String(item.id) === form.productId)
  const next = selected ? Number(selected.stock_quantity) + (form.adjustmentType === 'INCREASE' ? 1 : -1) * (Number(form.quantity) || 0) : null

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/inventory/adjust', form)
      onSaved(`${selected?.product_name || 'Product'} stock changed from ${quantity(data.data.previousStock)} to ${quantity(data.data.newStock)}.`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to adjust stock.'))
      setBusy(false)
    }
  }

  return (
    <Modal title="Adjust stock" kicker="Controlled movement" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Product" wide>
            <select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>
              <option value="">Select product</option>
              {products.map((item) => <option key={item.id} value={item.id}>{item.product_name} — {quantity(item.stock_quantity)} {item.unit} on hand</option>)}
            </select>
          </Field>
          <div className="field">
            <span className="field-label">Adjustment</span>
            <div className="segmented">
              <button type="button" className={form.adjustmentType === 'INCREASE' ? 'active' : ''} onClick={() => setForm({ ...form, adjustmentType: 'INCREASE' })}><ArrowUpRight size={15} /> Increase</button>
              <button type="button" className={form.adjustmentType === 'DECREASE' ? 'active' : ''} onClick={() => setForm({ ...form, adjustmentType: 'DECREASE' })}><ArrowDownRight size={15} /> Decrease</button>
            </div>
          </div>
          <Field label="Quantity"><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
          <Field label="Reason" wide><textarea required rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Spoilage, damaged in transit, physical count correction…" /></Field>
        </div>
        {selected && form.quantity && <p className={`field-hint ${next < 0 ? 'text-danger' : ''}`}>New stock will be <strong>{quantity(next)} {selected.unit}</strong>{next < 0 ? ' — not enough stock on hand.' : '.'}</p>}
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || next < 0}>{busy ? 'Saving…' : 'Record adjustment'}</button>
        </div>
      </form>
    </Modal>
  )
}

function MovementHistory({ product, onClose }) {
  const { data, loading, error } = useLoader(async () => (await api.get(`/inventory/${product.id}`)).data.data, [product.id])
  return (
    <Modal title={product.product_name} kicker="Stock movement history" onClose={onClose} size="lg">
      <Notice>{error}</Notice>
      {data && <p className="field-hint">Currently {quantity(data.product.stock_quantity)} {data.product.unit} on hand · reorder at {quantity(data.product.reorder_level)}. Showing the latest 50 movements.</p>}
      {loading && !data ? <Loader /> : (
        <ul className="movement-list">
          {(data?.transactions || []).map((move) => {
            const amount = Number(move.quantity)
            return (
              <li key={move.id}>
                <span className={`movement-icon ${amount >= 0 ? 'in' : 'out'}`}>{amount >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span>
                <span className="movement-text"><strong>{titleCase(move.transaction_type)}</strong><small>{move.notes || move.reference_type} · {move.user_name || 'System'} · {formatDateTime(move.created_at)}</small></span>
                <span className="movement-qty"><b className={amount >= 0 ? 'text-good' : 'text-danger'}>{amount >= 0 ? '+' : ''}{quantity(amount)}</b><small>{quantity(move.previous_stock)} → {quantity(move.new_stock)}</small></span>
              </li>
            )
          })}
        </ul>
      )}
      {data && !data.transactions.length && <EmptyState title="No movements yet" />}
    </Modal>
  )
}
