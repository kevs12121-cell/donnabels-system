import { useState } from 'react'
import { Edit3, Plus, Power } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../hooks/useLoader'
import { DataTable, Field, IconButton, Modal, Notice, PageHeader, SearchInput, StatusBadge } from '../components/ui'
import { formatDate } from '../utils/format'

const CONFIGS = {
  suppliers: {
    title: 'Suppliers',
    singular: 'supplier',
    kicker: 'Catalog · sourcing',
    description: 'Growers and wholesalers the shop orders from.',
    nameField: 'supplier_name',
    fields: [['supplier_code', 'Supplier code', true], ['supplier_name', 'Supplier name', true], ['contact_person', 'Contact person'], ['phone', 'Phone'], ['email', 'Email', false, 'email'], ['address', 'Address', false, 'textarea']],
    columns: [
      { key: 'supplier', label: 'Supplier', primary: true, render: (row) => <><strong>{row.supplier_name}</strong><small>{row.supplier_code}</small></> },
      { key: 'contact', label: 'Contact', render: (row) => <span className="cell-stack"><span>{row.contact_person || '—'}</span><small>{row.phone || ''}</small></span> },
      { key: 'email', label: 'Email', hideOnMobile: true, render: (row) => row.email || '—' },
      { key: 'address', label: 'Address', render: (row) => row.address || '—' },
      { key: 'orders', label: 'Orders', align: 'right', render: (row) => <span className="cell-stack align-right"><span>{row.purchase_count}</span><small>{row.last_purchase_date ? `last ${formatDate(row.last_purchase_date)}` : 'none yet'}</small></span> },
    ],
  },
  categories: {
    title: 'Categories',
    singular: 'category',
    kicker: 'Catalog · structure',
    description: 'How products are grouped on the register and in reports.',
    nameField: 'category_name',
    fields: [['category_name', 'Category name', true], ['description', 'Description', false, 'textarea']],
    columns: [
      { key: 'category', label: 'Category', primary: true, render: (row) => <strong>{row.category_name}</strong> },
      { key: 'description', label: 'Description', render: (row) => row.description || '—' },
      { key: 'products', label: 'Products', align: 'right', render: (row) => row.product_count },
    ],
  },
}

export default function DirectoryPage({ resource }) {
  const config = CONFIGS[resource]
  const { isOwner } = useAuth()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useLoader(async () => (await api.get(`/${resource}`)).data.data, [resource], [])
  const rows = data.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())))

  async function toggle(row) {
    setError('')
    try {
      await api.patch(`/${resource}/${row.id}/status`, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      setMessage(`${row[config.nameField]} is now ${row.status === 'ACTIVE' ? 'inactive' : 'active'}.`)
      reload()
    } catch (err) { setError(errorMessage(err)) }
  }

  const columns = [
    ...config.columns,
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    ...(isOwner ? [{ key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <IconButton label={`Edit ${row[config.nameField]}`} onClick={() => setEditing(row)}><Edit3 size={16} /></IconButton>
        <IconButton label={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} className={row.status === 'ACTIVE' ? 'danger' : ''} onClick={() => toggle(row)}><Power size={16} /></IconButton>
      </div>
    ) }] : []),
  ]

  return (
    <div>
      <PageHeader
        kicker={config.kicker}
        title={config.title}
        description={isOwner ? config.description : `${config.description} Only the owner can make changes.`}
        actions={isOwner && <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add {config.singular}</button>}
      />
      {message && <Notice type="success" onClose={() => setMessage('')}>{message}</Notice>}
      <Notice>{error || loadError}</Notice>
      <section className="panel panel-flush">
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder={`Search ${config.title.toLowerCase()}`} />
          <span className="result-count">{rows.length} {config.title.toLowerCase()}</span>
        </div>
        <DataTable columns={columns} rows={rows} loading={loading} caption={config.title} />
      </section>
      {editing && <DirectoryForm config={config} resource={resource} record={editing} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMessage(text); reload() }} />}
    </div>
  )
}

function DirectoryForm({ config, resource, record, onClose, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(config.fields.map(([key]) => [key, record[key] ?? ''])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (record.id) await api.put(`/${resource}/${record.id}`, form)
      else await api.post(`/${resource}`, form)
      onSaved(`${form[config.nameField]} was ${record.id ? 'updated' : 'added'}.`)
    } catch (err) {
      setError(errorMessage(err, `Unable to save the ${config.singular}.`))
      setBusy(false)
    }
  }

  return (
    <Modal title={record.id ? `Edit ${config.singular}` : `Add ${config.singular}`} kicker={config.title} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          {config.fields.map(([key, label, required, type]) => (
            <Field key={key} label={required ? label : `${label} (optional)`} wide={type === 'textarea'}>
              {type === 'textarea'
                ? <textarea rows={3} required={required} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
                : <input type={type || 'text'} required={required} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />}
            </Field>
          ))}
        </div>
        <Notice>{error}</Notice>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : record.id ? 'Save changes' : `Add ${config.singular}`}</button>
        </div>
      </form>
    </Modal>
  )
}
