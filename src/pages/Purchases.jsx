import { useState } from 'react'
import { Ban, Check, Eye, Plus, Trash2 } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../hooks/useLoader'
import { ConfirmDialog, DataTable, Field, IconButton, Loader, Modal, Notice, PageHeader, SearchInput, StatusBadge, Tabs } from '../components/ui'
import { formatDate, formatDateTime, localDate, money, quantity } from '../utils/format'

export default function Purchases() {
  const { isOwner } = useAuth()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [message, setMessage] = useState('')
  const { data, loading, error, reload } = useLoader(async () => {
    const [purchases, suppliers, products] = await Promise.all([api.get('/purchases'), api.get('/suppliers'), api.get('/products')])
    return { purchases: purchases.data.data, suppliers: suppliers.data.data.filter((item) => item.status === 'ACTIVE'), products: products.data.data.filter((item) => item.status === 'ACTIVE') }
  }, [], { purchases: [], suppliers: [], products: [] })

  const all = data.purchases
  const rows = all.filter((row) => (!status || row.status === status) && `${row.purchase_code} ${row.supplier_name}`.toLowerCase().includes(query.toLowerCase()))
  const count = (value) => all.filter((row) => row.status === value).length
  const pendingTotal = all.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + Number(row.total_amount), 0)
  const monthStart = `${localDate().slice(0, 8)}01`
  const receivedThisMonth = all.filter((row) => row.status === 'RECEIVED' && row.purchase_date >= monthStart).reduce((sum, row) => sum + Number(row.total_amount), 0)

  const askReceive = (row) => setConfirm({
    title: `Receive ${row.purchase_code}?`,
    message: `Stock for every item in this ${money(row.total_amount)} delivery from ${row.supplier_name} will be added to inventory. A purchase can only be received once.`,
    confirmLabel: 'Receive delivery',
    action: async () => { await api.post(`/purchases/${row.id}/receive`); setMessage(`${row.purchase_code} received. Stock levels were updated.`); reload() },
  })
  const askCancel = (row) => setConfirm({
    title: `Cancel ${row.purchase_code}?`,
    message: 'The order will be marked as cancelled and no stock will be added.',
    confirmLabel: 'Cancel purchase',
    tone: 'danger',
    reasonLabel: 'Reason',
    action: async (reason) => { await api.post(`/purchases/${row.id}/cancel`, { reason }); setMessage(`${row.purchase_code} was cancelled.`); reload() },
  })

  const columns = [
    { key: 'purchase', label: 'Purchase', primary: true, render: (row) => <><strong>{row.supplier_name}</strong><small>{row.purchase_code} · by {row.created_by_name}</small></> },
    { key: 'date', label: 'Delivery date', render: (row) => formatDate(row.purchase_date) },
    { key: 'lines', label: 'Lines', align: 'right', render: (row) => row.line_count },
    { key: 'total', label: 'Total', align: 'right', render: (row) => <strong>{money(row.total_amount)}</strong> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label="View purchase" onClick={() => setDetailId(row.id)}><Eye size={16} /></IconButton>
        {row.status === 'PENDING' && <IconButton label="Receive delivery" className="good" onClick={() => askReceive(row)}><Check size={16} /></IconButton>}
        {isOwner && row.status === 'PENDING' && <IconButton label="Cancel purchase" className="danger" onClick={() => askCancel(row)}><Ban size={16} /></IconButton>}
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader
        kicker="Supplier orders"
        title="Purchases"
        description="Order from suppliers and receive deliveries into stock exactly once."
        actions={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New purchase</button>}
      />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{error}</Notice>
      <div className="mini-stats">
        <div><span>Awaiting delivery</span><strong className={count('PENDING') ? 'text-warn' : ''}>{count('PENDING')}</strong></div>
        <div><span>Pending value</span><strong>{money(pendingTotal)}</strong></div>
        <div><span>Received this month</span><strong>{money(receivedThisMonth)}</strong></div>
      </div>
      <section className="panel panel-flush">
        <div className="toolbar">
          <Tabs label="Purchase status" value={status} onChange={setStatus} tabs={[['', 'All', all.length], ['PENDING', 'Pending', count('PENDING')], ['RECEIVED', 'Received', count('RECEIVED')], ['CANCELLED', 'Cancelled', count('CANCELLED')]]} />
          <SearchInput value={query} onChange={setQuery} placeholder="Search supplier or code" />
        </div>
        <DataTable columns={columns} rows={rows} loading={loading} caption="Purchases" />
      </section>
      {creating && <PurchaseForm suppliers={data.suppliers} products={data.products} onClose={() => setCreating(false)} onSaved={(text) => { setCreating(false); setMessage(text); reload() }} />}
      {detailId && <PurchaseDetail id={detailId} onClose={() => setDetailId(null)} onReceive={(row) => { setDetailId(null); askReceive(row) }} onCancel={isOwner ? (row) => { setDetailId(null); askCancel(row) } : null} />}
      {confirm && <ConfirmDialog {...confirm} onConfirm={confirm.action} onClose={() => setConfirm(null)} />}
    </div>
  )
}

function PurchaseForm({ suppliers, products, onClose, onSaved }) {
  const [form, setForm] = useState({ supplierId: '', purchaseDate: localDate(), discount: '', notes: '', items: [{ productId: '', quantity: '', unitCost: '' }] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0)
  const total = Math.max(0, subtotal - (Number(form.discount) || 0))

  function updateItem(index, changes) {
    setForm({ ...form, items: form.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)) })
  }
  function chooseProduct(index, productId) {
    const product = products.find((item) => String(item.id) === productId)
    updateItem(index, { productId, unitCost: product ? String(Number(product.cost_price)) : '' })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/purchases', { ...form, discount: Number(form.discount) || 0 })
      onSaved(`Purchase ${data.data.purchaseCode} saved as pending. Receive it when the delivery arrives.`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the purchase.'))
      setBusy(false)
    }
  }

  return (
    <Modal title="New purchase" kicker="Supplier order" onClose={onClose} size="lg">
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Supplier"><select required value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Select supplier</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.supplier_name}</option>)}</select></Field>
          <Field label="Delivery date"><input required type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} /></Field>
        </div>
        <div className="line-editor">
          <div className="line-editor-head"><strong>Items</strong><button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, items: [...form.items, { productId: '', quantity: '', unitCost: '' }] })}><Plus size={14} /> Add line</button></div>
          <div className="line-labels" aria-hidden="true"><span>Product</span><span>Qty</span><span>Unit cost</span><span>Amount</span><span /></div>
          {form.items.map((item, index) => (
            <div className="line-row" key={index}>
              <select required value={item.productId} onChange={(event) => chooseProduct(index, event.target.value)} aria-label={`Line ${index + 1} product`}>
                <option value="">Select product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.product_name} ({quantity(product.stock_quantity)} on hand)</option>)}
              </select>
              <input required type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Qty" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} aria-label={`Line ${index + 1} quantity`} />
              <input required type="number" min="0" step="0.01" inputMode="decimal" placeholder="Unit cost" value={item.unitCost} onChange={(event) => updateItem(index, { unitCost: event.target.value })} aria-label={`Line ${index + 1} unit cost`} />
              <span className="line-amount">{money((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}</span>
              <IconButton label={`Remove line ${index + 1}`} className="danger" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></IconButton>
            </div>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Discount (₱)"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} placeholder="0.00" /></Field>
          <div className="total-box"><span>Subtotal {money(subtotal)}</span><strong>Total {money(total)}</strong></div>
          <Field label="Notes" wide><textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional delivery notes" /></Field>
        </div>
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save pending purchase'}</button>
        </div>
      </form>
    </Modal>
  )
}

function PurchaseDetail({ id, onClose, onReceive, onCancel }) {
  const { data, loading, error } = useLoader(async () => (await api.get(`/purchases/${id}`)).data.data, [id])
  const pending = data?.status === 'PENDING'
  return (
    <Modal title={data?.purchase_code || 'Purchase'} kicker="Purchase detail" onClose={onClose} size="lg"
      footer={pending && <>{onCancel && <button type="button" className="btn btn-danger-ghost" onClick={() => onCancel(data)}><Ban size={15} /> Cancel purchase</button>}<button type="button" className="btn btn-primary" onClick={() => onReceive(data)}><Check size={16} /> Receive delivery</button></>}>
      <Notice>{error}</Notice>
      {loading && !data ? <Loader /> : data && (
        <div className="stack">
          <dl className="detail-grid">
            <div><dt>Supplier</dt><dd>{data.supplier_name}<small>{data.contact_person} {data.supplier_phone ? `· ${data.supplier_phone}` : ''}</small></dd></div>
            <div><dt>Delivery date</dt><dd>{formatDate(data.purchase_date)}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={data.status} /></dd></div>
            <div><dt>Created</dt><dd>{data.created_by_name}<small>{formatDateTime(data.created_at)}</small></dd></div>
          </dl>
          <div className="line-items">
            {data.items.map((item) => (
              <div key={item.id}><span><strong>{item.product_name}</strong><small>{quantity(item.quantity)} {item.unit} × {money(item.unit_cost)}</small></span><b>{money(item.subtotal)}</b></div>
            ))}
          </div>
          <div className="totals">
            <div><span>Subtotal</span><span>{money(data.subtotal)}</span></div>
            {Number(data.discount) > 0 && <div><span>Discount</span><span>−{money(data.discount)}</span></div>}
            <div className="totals-grand"><span>Total</span><strong>{money(data.total_amount)}</strong></div>
          </div>
          {data.notes && <p className="field-hint">Notes: {data.notes}</p>}
        </div>
      )}
    </Modal>
  )
}
