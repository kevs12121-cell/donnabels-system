import { AlertTriangle, Boxes, CalendarDays, ClipboardList, PackageX, Plus, RefreshCw, ShoppingBag, TrendingUp, Users, Wallet, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../hooks/useLoader'
import { EmptyState, Notice, StatCard, StatusBadge } from '../components/ui'
import { SalesTrendChart } from '../components/Charts'
import { compactMoney, formatDate, formatTime, greeting, money, quantity } from '../utils/format'

export default function Dashboard() {
  const { user, isOwner } = useAuth()
  const { data, loading, error, reload } = useLoader(async () => {
    const [summary, details] = await Promise.all([api.get('/dashboard/summary'), api.get('/dashboard/details')])
    return { summary: summary.data.data, details: details.data.data }
  })
  const summary = data?.summary
  const details = data?.details
  const value = (key, format = (number) => number.toLocaleString()) => (summary ? format(summary[key]) : '—')

  const ownerCards = [
    { label: "Today's sales", value: value('todaysSales', money), hint: `${value('todayTransactions')} completed transactions`, icon: TrendingUp, tone: 'brand', to: '/sales?tab=history' },
    { label: 'Month to date', value: value('monthSales', compactMoney), hint: `Expenses ${value('monthExpenses', compactMoney)} this month`, icon: CalendarDays, to: '/reports' },
    { label: "Today's expenses", value: value('todaysExpenses', money), hint: 'Active expenses recorded today', icon: Wallet, to: '/expenses' },
    { label: 'Pending purchases', value: value('pendingPurchases'), hint: 'Deliveries awaiting receipt', icon: ClipboardList, tone: summary?.pendingPurchases ? 'warn' : undefined, to: '/purchases' },
    { label: 'Low stock', value: value('lowStockItems'), hint: 'At or below reorder level', icon: AlertTriangle, tone: summary?.lowStockItems ? 'warn' : undefined, to: '/inventory?status=LOW%20STOCK' },
    { label: 'Out of stock', value: value('outOfStockItems'), hint: 'Cannot be sold right now', icon: PackageX, tone: summary?.outOfStockItems ? 'danger' : undefined, to: '/inventory?status=OUT%20OF%20STOCK' },
    { label: 'Inventory value', value: value('inventoryValue', compactMoney), hint: `${value('totalProducts')} active products at cost`, icon: Warehouse, to: '/inventory' },
    { label: 'Active employees', value: value('totalEmployees'), hint: 'Staff on the roster', icon: Users, to: '/employees' },
  ]
  const cashierCards = [
    { label: 'My sales today', value: value('mySalesToday', money), hint: `${value('myTransactionsToday')} transactions by you`, icon: TrendingUp, tone: 'brand', to: '/sales?tab=history&mine=1' },
    { label: 'Shop sales today', value: value('todaysSales', money), hint: `${value('todayTransactions')} transactions in total`, icon: ShoppingBag, to: '/sales?tab=history' },
    { label: 'Pending deliveries', value: value('pendingPurchases'), hint: 'Purchases to receive', icon: ClipboardList, tone: summary?.pendingPurchases ? 'warn' : undefined, to: '/purchases' },
    { label: 'Low stock', value: value('lowStockItems'), hint: 'At or below reorder level', icon: AlertTriangle, tone: summary?.lowStockItems ? 'warn' : undefined, to: '/inventory?status=LOW%20STOCK' },
    { label: 'Out of stock', value: value('outOfStockItems'), hint: 'Cannot be sold right now', icon: PackageX, tone: summary?.outOfStockItems ? 'danger' : undefined, to: '/inventory?status=OUT%20OF%20STOCK' },
    { label: 'Active products', value: value('totalProducts'), hint: 'Available in the catalog', icon: Boxes, to: '/products' },
  ]
  const weekTotal = details?.trend?.reduce((sum, day) => sum + day.total, 0) || 0

  return (
    <div className="dashboard">
      <div className="page-header">
        <div className="page-header-text">
          <p className="kicker">{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <h2>{greeting()}, {user?.firstName || user?.username}.</h2>
          <p className="page-description">{isOwner ? "Here's how Donz Flower Shop is doing today." : 'Ready for another blooming shift? Here is your day at a glance.'}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={reload} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
          <Link className="btn btn-primary" to="/sales"><Plus size={16} /> New sale</Link>
        </div>
      </div>

      {error && <Notice>{error} <button type="button" className="link-btn" onClick={reload}>Try again</button></Notice>}

      <div className={`stat-grid ${loading && !summary ? 'is-loading' : ''}`}>
        {(isOwner ? ownerCards : cashierCards).map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="dashboard-grid">
        <section className="panel panel-wide">
          <div className="panel-header">
            <div><p className="kicker">Last 7 days</p><h3>Sales trend</h3></div>
            <div className="panel-figure"><strong>{money(weekTotal)}</strong><span>completed sales this week</span></div>
          </div>
          {details ? <SalesTrendChart data={details.trend} /> : <div className="chart-placeholder" />}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><p className="kicker">Last 30 days</p><h3>Top products</h3></div>
            <Link className="text-link" to={isOwner ? '/reports' : '/products'}>See all</Link>
          </div>
          <ol className="rank-list">
            {(details?.topProducts || []).map((item, index) => (
              <li key={item.product_name}>
                <span className="rank">{index + 1}</span>
                <span className="rank-text"><strong>{item.product_name}</strong><small>{quantity(item.quantity_sold)} sold</small></span>
                <b>{money(item.sales_amount)}</b>
              </li>
            ))}
          </ol>
          {details && !details.topProducts.length && <EmptyState title="No sales yet" message="Completed sales will rank here." />}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><p className="kicker">Inventory watch</p><h3>Needs restocking</h3></div>
            <Link className="text-link" to="/inventory">Inventory</Link>
          </div>
          <ul className="compact-list">
            {(details?.lowStock || []).map((item) => (
              <li key={item.id}>
                <span><strong>{item.product_name}</strong><small>Reorder at {quantity(item.reorder_level)} {item.unit}</small></span>
                <span className="compact-end"><b className={item.stock_status === 'OUT OF STOCK' ? 'text-danger' : 'text-warn'}>{quantity(item.stock_quantity)} left</b><StatusBadge status={item.stock_status} /></span>
              </li>
            ))}
          </ul>
          {details && !details.lowStock.length && <EmptyState title="Stock levels are healthy" message="Nothing is below its reorder level." />}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><p className="kicker">{isOwner ? 'Register activity' : 'Your register'}</p><h3>{isOwner ? 'Recent sales' : 'My recent sales'}</h3></div>
            <Link className="text-link" to="/sales?tab=history">History</Link>
          </div>
          <ul className="compact-list">
            {(details?.recentSales || []).map((sale) => (
              <li key={sale.id}>
                <span><strong>{sale.sale_code}</strong><small>{formatDate(sale.sale_date)} · {formatTime(sale.sale_date)}{isOwner ? ` · ${sale.employee}` : ''}</small></span>
                <span className="compact-end"><b className={sale.sale_status === 'VOIDED' ? 'text-strike' : ''}>{money(sale.total_amount)}</b>{sale.sale_status === 'VOIDED' && <StatusBadge status="VOIDED" />}</span>
              </li>
            ))}
          </ul>
          {details && !details.recentSales.length && <EmptyState title="No sales yet" message="Your completed sales will appear here." />}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><p className="kicker">Supplier deliveries</p><h3>Recent purchases</h3></div>
            <Link className="text-link" to="/purchases">Purchases</Link>
          </div>
          <ul className="compact-list">
            {(details?.recentPurchases || []).map((purchase) => (
              <li key={purchase.id}>
                <span><strong>{purchase.supplier_name}</strong><small>{purchase.purchase_code} · {formatDate(purchase.purchase_date)}</small></span>
                <span className="compact-end"><b>{money(purchase.total_amount)}</b><StatusBadge status={purchase.status} /></span>
              </li>
            ))}
          </ul>
          {details && !details.recentPurchases.length && <EmptyState title="No purchases yet" />}
        </section>
      </div>
    </div>
  )
}
