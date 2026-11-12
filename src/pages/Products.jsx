import { useState } from 'react'
import { Edit3, Plus, Power } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../hooks/useLoader'
import { DataTable, Field, IconButton, Modal, Notice, PageHeader, SearchInput, StatusBadge } from '../components/ui'
import { money, quantity } from '../utils/format'

const EMPTY = { category_id: '', product_code: '', product_name: '', description: '', unit: 'piece', cost_price: '', selling_price: '', reorder_level: '' }

export default function Products() {
  const { isOwner } = useAuth()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useLoader(async () => {
    const [products, categories] = await Promise.all([api.get('/products'), api.get('/categories')])
    return { products: products.data.data, categories: categories.data.data }
  }, [], { products: [], categories: [] })

  const rows = data.products.filter((product) =>
    (!category || String(product.category_id) === category)
    && (!status || product.status === status)
    && `${product.product_code} ${product.product_name} ${product.category_name}`.toLowerCase().includes(query.toLowerCase()))

  async function toggle(product) {
    setError('')
    try {
      await api.patch(`/products/${product.id}/status`, { status: product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      setMessage(`${product.product_name} is now ${product.status === 'ACTIVE' ? 'inactive' : 'active'}.`)
      reload()
    } catch (err) { setError(errorMessage(err)) }
  }

  const columns = [
    { key: 'product', label: 'Product', primary: true, render: (row) => <><strong>{row.product_name}</strong><small>{row.product_code} · per {row.unit}</small></> },
    { key: 'category', label: 'Category', render: (row) => row.category_name || '—' },
    ...(isOwner ? [{ key: 'cost', label: 'Cost', align: 'right', render: (row) => money(row.cost_price) }] : []),
    { key: 'price', label: 'Price', align: 'right', render: (row) => <strong>{money(row.selling_price)}</strong> },
    ...(isOwner ? [{ key: 'margin', label: 'Margin', align: 'right', hideOnMobile: true, render: (row) => (Number(row.selling_price) ? `${Math.round(((row.selling_price - row.cost_price) / row.selling_price) * 100)}%` : '—') }] : []),
    { key: 'stock', label: 'On hand', align: 'right', render: (row) => `${quantity(row.stock_quantity)} ${row.unit}` },
    { key: 'stock_status', label: 'Stock', render: (row) => <StatusBadge status={row.stock_status} /> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    ...(isOwner ? [{ key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label={`Edit ${row.product_name}`} onClick={() => setEditing(row)}><Edit3 size={16} /></IconButton>
        <IconButton label={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} className={row.status === 'ACTIVE' ? 'danger' : ''} onClick={() => toggle(row)}><Power size={16} /></IconButton>
      </div>
    ) }] : []),
  ]

  return (
    <div>
      <PageHeader
        kicker="Catalog"
        title="Products"
        description={isOwner ? 'Manage what the shop sells, its pricing, and reorder levels.' : 'Look up prices, units and availability. Only the owner can change the catalog.'}
        actions={isOwner && <button type="button" className="btn btn-primary" onClick={() => setEditing(EMPTY)}><Plus size={16} /> Add product</button>}
      />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{error || loadError}</Notice>
      <section className="panel panel-flush">
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, code or category" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category"><option value="">All categories</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.category_name}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="">All statuses</option></select>
          <span className="result-count">{rows.length} products</span>
        </div>
        <DataTable columns={columns} rows={rows} loading={loading} caption="Products" />
      </section>
      {editing && <ProductForm product={editing} categories={data.categories} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMessage(text); reload() }} />}
    </div>
  )
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY, ...product, description: product.description || '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(Object.keys(EMPTY).map((key) => [key, form[key]]))
    try {
      if (product.id) await api.put(`/products/${product.id}`, payload)
      else await api.post('/products', payload)
      onSaved(`${form.product_name} was ${product.id ? 'updated' : 'added'}.`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the product.'))
      setBusy(false)
    }
  }

  return (
    <Modal title={product.id ? 'Edit product' : 'Add product'} kicker="Catalog entry" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Product code"><input required value={form.product_code} onChange={set('product_code')} placeholder="e.g. FLW-011" /></Field>
          <Field label="Product name"><input required value={form.product_name} onChange={set('product_name')} /></Field>
          <Field label="Category">
            <select required value={form.category_id} onChange={set('category_id')}>
              <option value="">Select category</option>
              {categories.filter((item) => item.status === 'ACTIVE' || item.id === Number(form.category_id)).map((item) => <option key={item.id} value={item.id}>{item.category_name}</option>)}
            </select>
          </Field>
          <Field label="Unit"><input required value={form.unit} onChange={set('unit')} placeholder="stem, bouquet, piece…" /></Field>
          <Field label="Cost price (₱)"><input required type="number" min="0" step="0.01" inputMode="decimal" value={form.cost_price} onChange={set('cost_price')} /></Field>
          <Field label="Selling price (₱)"><input required type="number" min="0" step="0.01" inputMode="decimal" value={form.selling_price} onChange={set('selling_price')} /></Field>
          <Field label="Reorder level" hint="Low-stock alerts trigger at or below this quantity."><input required type="number" min="0" step="1" inputMode="numeric" value={form.reorder_level} onChange={set('reorder_level')} /></Field>
          <Field label="Description" wide><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
        </div>
        {!product.id && <p className="field-hint">New products start with zero stock. Add stock through Purchases or an inventory adjustment.</p>}
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : product.id ? 'Save changes' : 'Add product'}</button>
        </div>
      </form>
    </Modal>
  )
}
