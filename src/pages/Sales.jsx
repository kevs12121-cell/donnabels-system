import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Check, Eye, Minus, Plus, Printer, ShoppingCart, Trash2 } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useDebounced, useLoader } from '../hooks/useLoader'
import { ConfirmDialog, DataTable, EmptyState, Field, IconButton, Loader, Modal, Notice, PageHeader, Pagination, SearchInput, StatusBadge, Tabs } from '../components/ui'
import { formatDate, formatDateTime, formatTime, localDate, methodLabel, money, PAYMENT_METHODS, quantity, shiftDays } from '../utils/format'

const round2 = (value) => Math.round(value * 100) / 100

export default function Sales() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'register'
  const [receipt, setReceipt] = useState(null)
  const settings = useLoader(async () => (await api.get('/admin/settings')).data.data, [], {})

  return (
    <div>
      <PageHeader
        kicker="Point of sale"
        title="Sales"
        description="Ring up customers quickly. Stock and payment are validated by the server before a sale is saved."
        actions={<Tabs label="Sales views" value={tab} onChange={(next) => setParams(next === 'history' ? { tab: 'history' } : {})} tabs={[['register', 'Register'], ['history', 'Sales history']]} />}
      />
      {tab === 'register' ? <Register onReceipt={setReceipt} /> : <History onReceipt={setReceipt} initialMine={params.get('mine') === '1'} />}
      {receipt && <ReceiptModal sale={receipt} settings={settings.data || {}} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function Register({ onReceipt }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [cart, setCart] = useState([])
  const [discount, setDiscount] = useState('')
  const [payment, setPayment] = useState({ method: 'CASH', amount: '', reference: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cartRef = useRef(null)
  const catalog = useLoader(async () => {
    const [products, categories] = await Promise.all([api.get('/products'), api.get('/categories')])
    return { products: products.data.data.filter((product) => product.status === 'ACTIVE'), categories: categories.data.data.filter((item) => item.status === 'ACTIVE') }
  }, [], { products: [], categories: [] })

  const products = catalog.data.products
  const visible = products.filter((product) => (!category || String(product.category_id) === category) && `${product.product_code} ${product.product_name}`.toLowerCase().includes(query.toLowerCase()))
  const subtotal = useMemo(() => round2(cart.reduce((sum, item) => sum + item.quantity * Number(item.selling_price), 0)), [cart])
  const discountValue = Math.min(Number(discount) || 0, subtotal)
  const total = round2(subtotal - discountValue)
  const isCash = payment.method === 'CASH'
  const paid = isCash ? Number(payment.amount) || 0 : total
  const change = Math.max(0, round2(paid - total))
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const quickCash = [...new Set([total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000])].filter((amount) => amount > 0).slice(0, 4)
  const canComplete = cart.length > 0 && !busy && (!isCash || paid >= total)

  function inCart(id) { return cart.find((item) => item.id === id)?.quantity || 0 }
  function add(product) {
    setError('')
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      if (found) return current.map((item) => (item.id === product.id ? { ...item, quantity: Math.min(Number(item.stock_quantity), item.quantity + 1) } : item))
      return [...current, { ...product, quantity: 1 }]
    })
  }
  function setQuantity(id, next) {
    setCart((current) => current.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, Math.min(Number(item.stock_quantity), Math.floor(Number(next) || 1))) } : item)))
  }
  function reset() {
    setCart([])
    setDiscount('')
    setPayment({ method: payment.method, amount: '', reference: '' })
  }

  async function complete() {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/sales', {
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        discount: discountValue,
        paymentMethod: payment.method,
        amountPaid: paid,
        paymentReference: isCash ? undefined : payment.reference,
      })
      const detail = await api.get(`/sales/${data.data.id}`)
      onReceipt(detail.data.data)
      reset()
      catalog.reload()
    } catch (err) {
      setError(errorMessage(err, 'Unable to complete the sale.'))
      catalog.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pos-grid">
      <section className="panel pos-products">
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search product or code" />
        </div>
        <div className="chip-row" role="group" aria-label="Filter by category">
          <button type="button" className={!category ? 'chip active' : 'chip'} onClick={() => setCategory('')}>All</button>
          {catalog.data.categories.map((item) => <button key={item.id} type="button" className={category === String(item.id) ? 'chip active' : 'chip'} onClick={() => setCategory(String(item.id))}>{item.category_name}</button>)}
        </div>
        {catalog.error && <Notice>{catalog.error}</Notice>}
        {catalog.loading && !products.length ? <Loader label="Loading products…" /> : (
          <div className="product-tiles">
            {visible.map((product) => {
              const stock = Number(product.stock_quantity)
              const remaining = stock - inCart(product.id)
              const low = stock > 0 && stock <= Number(product.reorder_level)
              return (
                <button key={product.id} type="button" className={`product-tile ${inCart(product.id) ? 'in-cart' : ''}`} disabled={remaining <= 0} onClick={() => add(product)}>
                  <span className="tile-top"><span className="tile-code">{product.product_code}</span>{inCart(product.id) > 0 && <span className="tile-qty">{inCart(product.id)}</span>}</span>
                  <strong>{product.product_name}</strong>
                  <span className="tile-price">{money(product.selling_price)} <small>/ {product.unit}</small></span>
                  <span className={`tile-stock ${stock <= 0 ? 'text-danger' : low ? 'text-warn' : ''}`}>{stock <= 0 ? 'Out of stock' : `${quantity(remaining)} available`}</span>
                </button>
              )
            })}
          </div>
        )}
        {!catalog.loading && !visible.length && <EmptyState title="No matching products" message="Try another search or category." />}
      </section>

      <section className="panel cart-panel" ref={cartRef} aria-label="Current sale">
        <div className="panel-header">
          <div><p className="kicker">Current sale</p><h3>{cart.length ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Cart is empty'}</h3></div>
          {cart.length > 0 && <button type="button" className="link-btn" onClick={reset}>Clear</button>}
        </div>
        <div className="cart-lines">
          {cart.map((item) => (
            <div className="cart-line" key={item.id}>
              <div className="cart-line-info"><strong>{item.product_name}</strong><small>{money(item.selling_price)} / {item.unit}</small></div>
              <div className="qty-control">
                <button type="button" onClick={() => setQuantity(item.id, item.quantity - 1)} aria-label={`Decrease ${item.product_name}`}><Minus size={14} /></button>
                <input type="number" inputMode="numeric" min="1" max={Number(item.stock_quantity)} value={item.quantity} onChange={(event) => setQuantity(item.id, event.target.value)} aria-label={`${item.product_name} quantity`} />
                <button type="button" onClick={() => setQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= Number(item.stock_quantity)} aria-label={`Increase ${item.product_name}`}><Plus size={14} /></button>
              </div>
              <strong className="cart-line-total">{money(item.quantity * Number(item.selling_price))}</strong>
              <IconButton label={`Remove ${item.product_name}`} className="danger" onClick={() => setCart(cart.filter((entry) => entry.id !== item.id))}><Trash2 size={15} /></IconButton>
            </div>
          ))}
          {!cart.length && <div className="cart-empty"><ShoppingCart size={22} aria-hidden="true" /><span>Tap a product to add it to the sale.</span></div>}
        </div>

        <div className="cart-summary">
          <div className="summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <Field label="Discount (₱)"><input type="number" min="0" max={subtotal} step="0.01" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" disabled={!cart.length} /></Field>
          <div className="summary-row summary-total"><span>Total</span><strong>{money(total)}</strong></div>
          <div className="field">
            <span className="field-label">Payment method</span>
            <div className="segmented">
              {PAYMENT_METHODS.map((method) => <button key={method} type="button" className={payment.method === method ? 'active' : ''} onClick={() => setPayment({ ...payment, method })}>{methodLabel(method)}</button>)}
            </div>
          </div>
          {isCash ? (
            <>
              <Field label="Cash received (₱)"><input type="number" min="0" step="0.01" inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} placeholder="0.00" disabled={!cart.length} /></Field>
              {cart.length > 0 && <div className="quick-cash">{quickCash.map((amount, index) => <button key={amount} type="button" onClick={() => setPayment({ ...payment, amount: String(amount) })}>{index === 0 ? 'Exact' : money(amount).replace('.00', '')}</button>)}</div>}
              <div className="summary-row change-row"><span>Change</span><strong>{money(change)}</strong></div>
            </>
          ) : (
            <Field label="Reference number" hint={`${methodLabel(payment.method)} payments are recorded for the exact total.`}><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Optional" disabled={!cart.length} /></Field>
          )}
          <Notice>{error}</Notice>
          {isCash && cart.length > 0 && paid > 0 && paid < total && <p className="field-hint text-danger">Cash received is less than the total.</p>}
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!canComplete} onClick={complete}><Check size={18} /> {busy ? 'Saving sale…' : `Complete sale · ${money(total)}`}</button>
        </div>
      </section>

      {cart.length > 0 && (
        <div className="checkout-bar">
          <span><strong>{money(total)}</strong><small>{itemCount} item{itemCount === 1 ? '' : 's'} in cart</small></span>
          <button type="button" className="btn btn-primary" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Review & pay</button>
        </div>
      )}
    </div>
  )
}

const RANGES = { today: ['Today', 0], week: ['Last 7 days', -6], month: ['Last 30 days', -29], all: ['All time', null] }

function History({ onReceipt, initialMine }) {
  const { isOwner } = useAuth()
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('week')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [mine, setMine] = useState(initialMine)
  const [page, setPage] = useState(1)
  const [voiding, setVoiding] = useState(null)
  const [message, setMessage] = useState('')
  const debounced = useDebounced(search)
  const startDate = RANGES[range][1] === null ? undefined : localDate(shiftDays(RANGES[range][1]))

  const sales = useLoader(async () => (await api.get('/sales', { params: { search: debounced || undefined, status: status || undefined, paymentMethod: method || undefined, mine: mine ? 'true' : undefined, startDate, page, limit: 15 } })).data.data,
    [debounced, range, status, method, mine, page], { rows: [], pagination: {}, summary: {} })
  const update = (setter) => (value) => { setter(value); setPage(1) }

  async function open(id) {
    try { onReceipt((await api.get(`/sales/${id}`)).data.data) } catch (err) { setMessage(errorMessage(err)) }
  }

  const columns = [
    { key: 'sale', label: 'Sale', primary: true, render: (row) => <><strong>{row.sale_code}</strong><small>{formatDate(row.sale_date)} · {formatTime(row.sale_date)}</small></> },
    { key: 'cashier', label: 'Cashier', render: (row) => row.created_by_name },
    { key: 'items', label: 'Items', align: 'right', render: (row) => quantity(row.item_count) },
    { key: 'method', label: 'Payment', render: (row) => methodLabel(row.payment_method) },
    { key: 'total', label: 'Total', align: 'right', render: (row) => <strong className={row.sale_status === 'VOIDED' ? 'text-strike' : ''}>{money(row.total_amount)}</strong> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.sale_status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label="View receipt" onClick={() => open(row.id)}><Eye size={16} /></IconButton>
        {isOwner && row.sale_status === 'COMPLETED' && <IconButton label="Void sale" className="danger" onClick={() => setVoiding(row)}><Ban size={16} /></IconButton>}
      </div>
    ) },
  ]

  return (
    <>
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      {sales.error && <Notice>{sales.error}</Notice>}
      <div className="mini-stats">
        <div><span>Sales in view</span><strong>{(sales.data.summary.count ?? 0).toLocaleString()}</strong></div>
        <div><span>Completed amount</span><strong>{money(sales.data.summary.completedAmount)}</strong></div>
        <div><span>Period</span><strong>{RANGES[range][0]}</strong></div>
      </div>
      <section className="panel panel-flush">
        <div className="toolbar">
          <SearchInput value={search} onChange={update(setSearch)} placeholder="Search sale code" />
          <select value={range} onChange={(event) => update(setRange)(event.target.value)} aria-label="Date range">{Object.entries(RANGES).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={status} onChange={(event) => update(setStatus)(event.target.value)} aria-label="Sale status"><option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="VOIDED">Voided</option></select>
          <select value={method} onChange={(event) => update(setMethod)(event.target.value)} aria-label="Payment method"><option value="">All payments</option>{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{methodLabel(item)}</option>)}</select>
          <label className="toggle"><input type="checkbox" checked={mine} onChange={(event) => update(setMine)(event.target.checked)} /><span>Only my sales</span></label>
        </div>
        <DataTable columns={columns} rows={sales.data.rows} loading={sales.loading} caption="Sales history" />
        <Pagination page={sales.data.pagination.page || 1} pages={sales.data.pagination.pages || 1} total={sales.data.pagination.total} onChange={setPage} noun="sales" />
      </section>
      {voiding && (
        <ConfirmDialog
          title={`Void ${voiding.sale_code}?`}
          message={`This cancels the ${money(voiding.total_amount)} sale and returns its items to stock. This cannot be undone.`}
          confirmLabel="Void sale"
          tone="danger"
          reasonLabel="Reason"
          onConfirm={async (reason) => { await api.post(`/sales/${voiding.id}/void`, { reason }); setMessage(`${voiding.sale_code} was voided and stock was restored.`); sales.reload() }}
          onClose={() => setVoiding(null)}
        />
      )}
    </>
  )
}

function ReceiptModal({ sale, settings, onClose }) {
  const payment = sale.payments?.[0]
  function print() {
    document.body.classList.add('print-receipt')
    window.print()
    setTimeout(() => document.body.classList.remove('print-receipt'), 300)
  }
  return (
    <Modal title="Receipt" kicker={sale.sale_status === 'VOIDED' ? 'Voided sale' : 'Sale completed'} onClose={onClose} size="sm"
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button><button type="button" className="btn btn-primary" onClick={print}><Printer size={16} /> Print receipt</button></>}>
      <div className={`receipt ${sale.sale_status === 'VOIDED' ? 'is-voided' : ''}`}>
        <div className="receipt-head">
          <strong>{settings.shop_name || 'Donz Flower Shop'}</strong>
          {settings.address && <span>{settings.address}</span>}
          {settings.phone && <span>{settings.phone}</span>}
        </div>
        <div className="receipt-meta">
          <span>{sale.sale_code}</span>
          <span>{formatDateTime(sale.sale_date)}</span>
          <span>Cashier: {sale.created_by_name || sale.created_by_username}</span>
        </div>
        <div className="receipt-items">
          {sale.items.map((item) => (
            <div key={item.id}>
              <span>{item.product_name}<small>{quantity(item.quantity)} × {money(item.unit_price)}</small></span>
              <strong>{money(item.subtotal)}</strong>
            </div>
          ))}
        </div>
        <div className="receipt-totals">
          <div><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
          {Number(sale.discount) > 0 && <div><span>Discount</span><span>−{money(sale.discount)}</span></div>}
          <div className="receipt-total"><span>Total</span><strong>{money(sale.total_amount)}</strong></div>
          <div><span>Paid ({methodLabel(payment?.payment_method)})</span><span>{money(sale.amount_paid)}</span></div>
          <div><span>Change</span><span>{money(sale.change_amount)}</span></div>
          {payment?.payment_reference && <div><span>Reference</span><span>{payment.payment_reference}</span></div>}
        </div>
        {sale.sale_status === 'VOIDED' && <div className="receipt-void">VOIDED</div>}
        <p className="receipt-foot">{settings.receipt_footer || 'Thank you for your purchase!'}</p>
      </div>
    </Modal>
  )
}
