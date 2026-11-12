import { useState } from 'react'
import { Download, Printer, RefreshCw } from 'lucide-react'
import api from '../services/api'
import { useLoader } from '../hooks/useLoader'
import { DataTable, Loader, Notice, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { BreakdownBars } from '../components/Charts'
import { formatDate, formatDateTime, localDate, methodLabel, money, percent, quantity, shiftDays, titleCase } from '../utils/format'

function presetRange(name) {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const ranges = {
    today: [now, now],
    yesterday: [shiftDays(-1), shiftDays(-1)],
    last7: [shiftDays(-6), now],
    month: [firstOfMonth, now],
    lastMonth: [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)],
    last30: [shiftDays(-29), now],
    last90: [shiftDays(-89), now],
  }
  const [start, end] = ranges[name] || ranges.month
  return [localDate(start), localDate(end)]
}
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['month', 'This month'], ['lastMonth', 'Last month'], ['last30', 'Last 30 days'], ['last90', 'Last 90 days']]

const REPORTS = {
  sales: {
    label: 'Sales',
    metrics: [['totalSales', 'Net sales', money], ['transactions', 'Transactions'], ['averageSale', 'Average sale', money], ['totalDiscounts', 'Discounts given', money], ['voidedSales', 'Voided sales']],
    columns: [
      { key: 'sale_code', label: 'Sale', primary: true, render: (row) => <><strong>{row.sale_code}</strong><small>{formatDateTime(row.sale_date)}</small></>, csv: (row) => row.sale_code },
      { key: 'sale_date', label: 'Date', hideOnMobile: true, render: (row) => formatDate(row.sale_date), csv: (row) => row.sale_date },
      { key: 'cashier', label: 'Cashier' },
      { key: 'payment_method', label: 'Payment', render: (row) => methodLabel(row.payment_method) },
      { key: 'item_count', label: 'Items', align: 'right', render: (row) => quantity(row.item_count) },
      { key: 'discount', label: 'Discount', align: 'right', render: (row) => money(row.discount) },
      { key: 'total_amount', label: 'Total', align: 'right', render: (row) => <strong className={row.sale_status === 'VOIDED' ? 'text-strike' : ''}>{money(row.total_amount)}</strong> },
      { key: 'sale_status', label: 'Status', render: (row) => <StatusBadge status={row.sale_status} /> },
    ],
  },
  inventory: {
    label: 'Inventory',
    snapshot: true,
    metrics: [['products', 'Active products'], ['stockValue', 'Stock value (cost)', money], ['retailValue', 'Retail value', money], ['lowStock', 'Low stock'], ['outOfStock', 'Out of stock']],
    columns: [
      { key: 'product_name', label: 'Product', primary: true, render: (row) => <><strong>{row.product_name}</strong><small>{row.product_code}</small></> },
      { key: 'category_name', label: 'Category' },
      { key: 'stock_quantity', label: 'On hand', align: 'right', render: (row) => `${quantity(row.stock_quantity)} ${row.unit}` },
      { key: 'reorder_level', label: 'Reorder at', align: 'right', render: (row) => quantity(row.reorder_level) },
      { key: 'cost_price', label: 'Cost', align: 'right', hideOnMobile: true, render: (row) => money(row.cost_price) },
      { key: 'selling_price', label: 'Price', align: 'right', hideOnMobile: true, render: (row) => money(row.selling_price) },
      { key: 'stock_value', label: 'Value (cost)', align: 'right', render: (row) => money(row.stock_value) },
      { key: 'stock_status', label: 'Status', render: (row) => <StatusBadge status={row.stock_status} /> },
    ],
  },
  'inventory-movements': {
    label: 'Stock movements',
    metrics: [['movements', 'Movements'], ['unitsIn', 'Units in', quantity], ['unitsOut', 'Units out', quantity]],
    breakdownQuantity: true,
    columns: [
      { key: 'product_name', label: 'Product', primary: true, render: (row) => <><strong>{row.product_name}</strong><small>{formatDateTime(row.created_at)}</small></>, csv: (row) => row.product_name },
      { key: 'created_at', label: 'Date', hideOnMobile: true, render: (row) => formatDateTime(row.created_at), csv: (row) => row.created_at },
      { key: 'transaction_type', label: 'Type', render: (row) => titleCase(row.transaction_type) },
      { key: 'quantity', label: 'Change', align: 'right', render: (row) => <strong className={Number(row.quantity) >= 0 ? 'text-good' : 'text-danger'}>{Number(row.quantity) >= 0 ? '+' : ''}{quantity(row.quantity)}</strong> },
      { key: 'stock', label: 'Stock', align: 'right', render: (row) => `${quantity(row.previous_stock)} → ${quantity(row.new_stock)}`, csv: (row) => `${row.previous_stock} -> ${row.new_stock}` },
      { key: 'notes', label: 'Notes', render: (row) => row.notes || '—' },
      { key: 'user_name', label: 'By', render: (row) => row.user_name || 'System' },
    ],
  },
  purchases: {
    label: 'Purchases',
    metrics: [['totalPurchases', 'Received value', money], ['purchases', 'Orders'], ['receivedPurchases', 'Received'], ['pendingPurchases', 'Pending']],
    columns: [
      { key: 'supplier_name', label: 'Supplier', primary: true, render: (row) => <><strong>{row.supplier_name}</strong><small>{row.purchase_code}</small></>, csv: (row) => row.supplier_name },
      { key: 'purchase_code', label: 'Code', hideOnMobile: true },
      { key: 'purchase_date', label: 'Delivery date', render: (row) => formatDate(row.purchase_date), csv: (row) => row.purchase_date },
      { key: 'line_count', label: 'Lines', align: 'right' },
      { key: 'total_amount', label: 'Total', align: 'right', render: (row) => money(row.total_amount) },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      { key: 'created_by_name', label: 'Created by', hideOnMobile: true },
    ],
  },
  expenses: {
    label: 'Expenses',
    metrics: [['totalExpenses', 'Total expenses', money], ['expenses', 'Entries'], ['voidedExpenses', 'Voided']],
    columns: [
      { key: 'description', label: 'Expense', primary: true, render: (row) => <><strong>{row.description}</strong><small>{row.expense_code}</small></> },
      { key: 'expense_date', label: 'Date', render: (row) => formatDate(row.expense_date), csv: (row) => row.expense_date },
      { key: 'category', label: 'Category' },
      { key: 'payment_method', label: 'Paid via', render: (row) => methodLabel(row.payment_method) },
      { key: 'amount', label: 'Amount', align: 'right', render: (row) => <strong className={row.status === 'VOIDED' ? 'text-strike' : ''}>{money(row.amount)}</strong> },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      { key: 'created_by_name', label: 'Recorded by', hideOnMobile: true },
    ],
  },
  'profit-summary': { label: 'Profit & loss', columns: [] },
}

function downloadCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const lines = [columns.map((column) => escape(column.label)), ...rows.map((row) => columns.map((column) => escape(column.csv ? column.csv(row) : row[column.key])))]
  const blob = new Blob([`﻿${lines.map((line) => line.join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const [type, setType] = useState('sales')
  const [preset, setPreset] = useState('month')
  const [[startDate, endDate], setDates] = useState(() => presetRange('month'))
  const config = REPORTS[type]
  const report = useLoader(async () => ({ type, data: (await api.get(`/reports/${type}`, { params: { startDate, endDate } })).data.data }), [type, startDate, endDate])
  const current = report.data?.type === type ? report.data.data : null
  const rows = current?.rows || []

  function choosePreset(value) {
    setPreset(value)
    if (value !== 'custom') setDates(presetRange(value))
  }

  return (
    <div className="reports-page">
      <PageHeader
        kicker="Owner insights"
        title="Reports"
        description="Sales, stock, purchasing, expenses and estimated profit for any period."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={report.reload} disabled={report.loading}><RefreshCw size={15} className={report.loading ? 'spin' : ''} /> Refresh</button>
            <button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv(`donz-${type}-${config.snapshot ? localDate() : `${startDate}-to-${endDate}`}.csv`, config.columns, rows)}><Download size={15} /> CSV</button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}><Printer size={15} /> Print</button>
          </>
        }
      />
      <div className="report-controls panel">
        <Tabs label="Report type" value={type} onChange={setType} tabs={Object.entries(REPORTS).map(([key, value]) => [key, value.label])} />
        {config.snapshot ? <p className="field-hint">Current stock snapshot as of today.</p> : (
          <div className="date-controls">
            <select value={preset} onChange={(event) => choosePreset(event.target.value)} aria-label="Date preset">{PRESETS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="custom">Custom range</option></select>
            <input type="date" value={startDate} max={endDate} onChange={(event) => { setPreset('custom'); setDates([event.target.value, endDate]) }} aria-label="Start date" />
            <span>to</span>
            <input type="date" value={endDate} min={startDate} onChange={(event) => { setPreset('custom'); setDates([startDate, event.target.value]) }} aria-label="End date" />
          </div>
        )}
      </div>
      <div className="print-only print-title"><strong>Donz Flower Shop — {config.label} report</strong><span>{config.snapshot ? `As of ${formatDate(localDate())}` : `${formatDate(startDate)} to ${formatDate(endDate)}`}</span></div>

      <Notice>{report.error}</Notice>
      {!current ? <Loader label="Preparing report…" /> : (
        <div className={report.loading ? 'is-refreshing' : ''}>
          {type === 'profit-summary' ? <ProfitStatement data={current} /> : (
            <>
              <div className="metric-row">
                {config.metrics.map(([key, label, format]) => <div key={key} className="metric"><span>{label}</span><strong>{format ? format(current.summary?.[key]) : Number(current.summary?.[key] || 0).toLocaleString()}</strong></div>)}
              </div>
              {current.breakdowns?.length > 0 && (
                <div className="breakdown-grid">
                  {current.breakdowns.map((breakdown) => (
                    <section className="panel" key={breakdown.title}>
                      <div className="panel-header"><h3>{breakdown.title}</h3></div>
                      <BreakdownBars rows={breakdown.rows} quantityMode={breakdown.quantity || config.breakdownQuantity} countLabel={type === 'inventory' ? 'products' : type === 'inventory-movements' ? 'movements' : type === 'sales' && breakdown.title === 'Top products' ? 'units' : 'records'} />
                    </section>
                  ))}
                </div>
              )}
              <section className="panel panel-flush">
                <div className="panel-header panel-header-padded">
                  <h3>{config.label} detail</h3>
                  <span className="result-count">{rows.length.toLocaleString()} rows{rows.length >= 2000 ? ' (latest 2,000)' : ''}</span>
                </div>
                <DataTable columns={config.columns} rows={rows} rowKey={type === 'sales' ? 'id' : undefined} caption={`${config.label} report`} />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ProfitStatement({ data }) {
  const lines = [
    ['Gross sales', data.grossSales, 'Completed sales after discounts'],
    ['Cost of goods sold', -data.cogs, 'Product cost recorded at the time of each sale'],
    ['Gross profit', data.grossProfit, `${percent(data.grossMargin)} gross margin`, true],
    ['Operating expenses', -data.expenses, 'Rent, utilities, transport, supplies and more'],
    ['Net profit (estimate)', data.netProfitEstimate, `${percent(data.netMargin)} net margin`, true],
  ]
  return (
    <div className="profit-layout">
      <section className="panel">
        <div className="panel-header"><div><p className="kicker">Estimated</p><h3>Profit & loss statement</h3></div></div>
        <dl className="statement">
          {lines.map(([label, value, hint, emphasis]) => (
            <div key={label} className={emphasis ? 'statement-total' : ''}>
              <dt>{label}<small>{hint}</small></dt>
              <dd className={value < 0 && emphasis ? 'text-danger' : ''}>{value < 0 && !emphasis ? `(${money(Math.abs(value))})` : money(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="field-hint">For reference: supplier deliveries received in this period totalled {money(data.purchases)}. Purchases become cost of goods when the stock is sold.</p>
      </section>
      <section className="panel">
        <div className="panel-header"><h3>Operating expenses by category</h3></div>
        <BreakdownBars rows={data.breakdowns?.[0]?.rows || []} countLabel="entries" />
      </section>
    </div>
  )
}
