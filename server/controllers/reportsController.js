import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError } from '../utils/transaction.js'
import { isoDate } from '../utils/validation.js'
import { localDate } from '../utils/time.js'

function range(req) {
  const startDate = req.query.startDate || localDate()
  const endDate = req.query.endDate || startDate
  isoDate(startDate, 'Start date')
  isoDate(endDate, 'End date')
  if (startDate > endDate) throw apiError('Start date must be on or before end date')
  return { startDate, endDate, from: `${startDate} 00:00:00`, to: `${endDate} 23:59:59` }
}

function filters(req, allowed = []) {
  return allowed.reduce((result, key) => {
    if (req.query[key] !== undefined && req.query[key] !== '') result[key] = req.query[key]
    return result
  }, {})
}

const EMPLOYEE_NAME = "COALESCE(CONCAT(e.first_name, ' ', e.last_name), u.username)"

export async function salesReport(req, res) {
  const { startDate, endDate, from, to } = range(req)
  const filter = filters(req, ['employeeId', 'paymentMethod', 'status'])
  const conditions = ['s.sale_date BETWEEN ? AND ?']
  const values = [from, to]
  if (filter.employeeId) { conditions.push('s.created_by = ?'); values.push(filter.employeeId) }
  if (filter.paymentMethod) { conditions.push('EXISTS (SELECT 1 FROM payments px WHERE px.sale_id = s.id AND px.payment_method = ?)'); values.push(filter.paymentMethod) }
  if (filter.status) { conditions.push('s.sale_status = ?'); values.push(filter.status) }
  const where = conditions.join(' AND ')

  const [[summary]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN s.sale_status = 'COMPLETED' THEN s.total_amount END), 0) AS total_sales,
            COALESCE(SUM(s.sale_status = 'COMPLETED'), 0) AS transactions,
            COALESCE(AVG(CASE WHEN s.sale_status = 'COMPLETED' THEN s.total_amount END), 0) AS average_sale,
            COALESCE(SUM(CASE WHEN s.sale_status = 'COMPLETED' THEN s.discount END), 0) AS total_discounts,
            COALESCE(SUM(s.sale_status = 'VOIDED'), 0) AS voided
     FROM sales s WHERE ${where}`,
    values,
  )
  const [rows] = await pool.query(
    `SELECT s.id, s.sale_code, s.sale_date, ${EMPLOYEE_NAME} AS cashier,
       (SELECT GROUP_CONCAT(DISTINCT pay.payment_method) FROM payments pay WHERE pay.sale_id = s.id) AS payment_method,
       (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,
       s.subtotal, s.discount, s.total_amount, s.sale_status
     FROM sales s LEFT JOIN users u ON u.id = s.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} ORDER BY s.sale_date DESC`,
    values,
  )
  const [byPaymentMethod] = await pool.query(
    `SELECT pay.payment_method AS label, COUNT(DISTINCT s.id) AS count, COALESCE(SUM(s.total_amount), 0) AS total
     FROM sales s JOIN payments pay ON pay.sale_id = s.id WHERE ${where} AND s.sale_status = 'COMPLETED'
     GROUP BY pay.payment_method ORDER BY total DESC`,
    values,
  )
  const [topProducts] = await pool.query(
    `SELECT p.product_name AS label, SUM(si.quantity) AS count, SUM(si.subtotal) AS total
     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
     WHERE ${where} AND s.sale_status = 'COMPLETED' GROUP BY p.id, p.product_name ORDER BY total DESC LIMIT 8`,
    values,
  )
  const [byCashier] = await pool.query(
    `SELECT ${EMPLOYEE_NAME} AS label, COUNT(*) AS count, COALESCE(SUM(s.total_amount), 0) AS total
     FROM sales s LEFT JOIN users u ON u.id = s.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} AND s.sale_status = 'COMPLETED' GROUP BY s.created_by, label ORDER BY total DESC`,
    values,
  )
  return success(res, {
    range: { startDate, endDate },
    summary: { totalSales: Number(summary.total_sales), transactions: Number(summary.transactions), averageSale: Number(summary.average_sale), totalDiscounts: Number(summary.total_discounts), voidedSales: Number(summary.voided) },
    breakdowns: [
      { title: 'By payment method', rows: byPaymentMethod },
      { title: 'Top products', rows: topProducts },
      { title: 'By cashier', rows: byCashier },
    ],
    rows,
  })
}

export async function inventoryReport(req, res) {
  const filter = filters(req, ['categoryId', 'status'])
  const conditions = ['1 = 1']
  const values = []
  if (filter.categoryId) { conditions.push('p.category_id = ?'); values.push(filter.categoryId) }
  const [allRows] = await pool.query(
    `SELECT p.product_code, p.product_name, c.category_name, p.unit, p.stock_quantity, p.reorder_level, p.cost_price, p.selling_price,
       p.stock_quantity * p.cost_price AS stock_value, p.stock_quantity * p.selling_price AS retail_value,
       CASE WHEN p.stock_quantity <= 0 THEN 'OUT OF STOCK' WHEN p.stock_quantity <= p.reorder_level THEN 'LOW STOCK' ELSE 'IN STOCK' END AS stock_status
     FROM products p JOIN categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} AND p.status = 'ACTIVE' ORDER BY p.product_name`,
    values,
  )
  const rows = allRows.filter((row) => !filter.status || row.stock_status === filter.status)
  const sum = (key) => rows.reduce((total, row) => total + Number(row[key]), 0)
  const [byCategory] = await pool.query(
    `SELECT c.category_name AS label, COUNT(*) AS count, COALESCE(SUM(p.stock_quantity * p.cost_price), 0) AS total
     FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'ACTIVE' GROUP BY c.id, c.category_name ORDER BY total DESC`,
  )
  return success(res, {
    summary: { products: rows.length, stockValue: sum('stock_value'), retailValue: sum('retail_value'), lowStock: rows.filter((row) => row.stock_status === 'LOW STOCK').length, outOfStock: rows.filter((row) => row.stock_status === 'OUT OF STOCK').length },
    breakdowns: [{ title: 'Stock value by category', rows: byCategory }],
    rows,
  })
}

export async function inventoryMovementsReport(req, res) {
  const { startDate, endDate, from, to } = range(req)
  const filter = filters(req, ['productId', 'transactionType', 'userId'])
  const conditions = ['it.created_at BETWEEN ? AND ?']
  const values = [from, to]
  if (filter.productId) { conditions.push('it.product_id = ?'); values.push(filter.productId) }
  if (filter.transactionType) { conditions.push('it.transaction_type = ?'); values.push(filter.transactionType) }
  if (filter.userId) { conditions.push('it.created_by = ?'); values.push(filter.userId) }
  const where = conditions.join(' AND ')
  const [rows] = await pool.query(
    `SELECT it.created_at, p.product_code, p.product_name, it.transaction_type, it.quantity, it.previous_stock, it.new_stock, it.notes, ${EMPLOYEE_NAME} AS user_name
     FROM inventory_transactions it JOIN products p ON p.id = it.product_id LEFT JOIN users u ON u.id = it.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} ORDER BY it.created_at DESC, it.id DESC LIMIT 2000`,
    values,
  )
  const [byType] = await pool.query(
    `SELECT it.transaction_type AS label, COUNT(*) AS count, COALESCE(SUM(it.quantity), 0) AS total FROM inventory_transactions it WHERE ${where} GROUP BY it.transaction_type ORDER BY count DESC`,
    values,
  )
  const stockIn = byType.filter((row) => Number(row.total) > 0).reduce((sum, row) => sum + Number(row.total), 0)
  const stockOut = byType.filter((row) => Number(row.total) < 0).reduce((sum, row) => sum + Number(row.total), 0)
  return success(res, {
    range: { startDate, endDate },
    summary: { movements: byType.reduce((sum, row) => sum + Number(row.count), 0), unitsIn: stockIn, unitsOut: Math.abs(stockOut) },
    breakdowns: [{ title: 'Movements by type', rows: byType, quantity: true }],
    rows,
  })
}

export async function purchasesReport(req, res) {
  const { startDate, endDate } = range(req)
  const filter = filters(req, ['supplierId', 'status'])
  const conditions = ['p.purchase_date BETWEEN ? AND ?']
  const values = [startDate, endDate]
  if (filter.supplierId) { conditions.push('p.supplier_id = ?'); values.push(filter.supplierId) }
  if (filter.status) { conditions.push('p.status = ?'); values.push(filter.status) }
  const where = conditions.join(' AND ')
  const [[summary]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN p.status = 'RECEIVED' THEN p.total_amount END), 0) AS total_purchases, COUNT(*) AS purchases,
       COALESCE(SUM(p.status = 'RECEIVED'), 0) AS received_purchases, COALESCE(SUM(p.status = 'PENDING'), 0) AS pending_purchases
     FROM purchases p WHERE ${where}`,
    values,
  )
  const [rows] = await pool.query(
    `SELECT p.purchase_code, p.purchase_date, s.supplier_name, (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS line_count,
       p.total_amount, p.status, ${EMPLOYEE_NAME} AS created_by_name
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} ORDER BY p.purchase_date DESC, p.created_at DESC`,
    values,
  )
  const [bySupplier] = await pool.query(
    `SELECT s.supplier_name AS label, COUNT(*) AS count, COALESCE(SUM(p.total_amount), 0) AS total FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
     WHERE ${where} AND p.status = 'RECEIVED' GROUP BY s.id, s.supplier_name ORDER BY total DESC`,
    values,
  )
  return success(res, {
    range: { startDate, endDate },
    summary: { totalPurchases: Number(summary.total_purchases), purchases: Number(summary.purchases), receivedPurchases: Number(summary.received_purchases), pendingPurchases: Number(summary.pending_purchases) },
    breakdowns: [{ title: 'Received by supplier', rows: bySupplier }],
    rows,
  })
}

export async function expensesReport(req, res) {
  const { startDate, endDate } = range(req)
  const filter = filters(req, ['category', 'paymentMethod', 'status'])
  const conditions = ['ex.expense_date BETWEEN ? AND ?']
  const values = [startDate, endDate]
  if (filter.category) { conditions.push('ex.category = ?'); values.push(filter.category) }
  if (filter.paymentMethod) { conditions.push('ex.payment_method = ?'); values.push(filter.paymentMethod) }
  if (filter.status) { conditions.push('ex.status = ?'); values.push(filter.status) }
  const where = conditions.join(' AND ')
  const [[summary]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN ex.status = 'ACTIVE' THEN ex.amount END), 0) AS total_expenses, COALESCE(SUM(ex.status = 'ACTIVE'), 0) AS expenses, COALESCE(SUM(ex.status = 'VOIDED'), 0) AS voided
     FROM expenses ex WHERE ${where}`,
    values,
  )
  const [byCategory] = await pool.query(
    `SELECT ex.category AS label, COUNT(*) AS count, SUM(ex.amount) AS total FROM expenses ex WHERE ${where} AND ex.status = 'ACTIVE' GROUP BY ex.category ORDER BY total DESC`,
    values,
  )
  const [rows] = await pool.query(
    `SELECT ex.expense_code, ex.expense_date, ex.category, ex.description, ex.payment_method, ex.amount, ex.status, ${EMPLOYEE_NAME} AS created_by_name
     FROM expenses ex JOIN users u ON u.id = ex.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} ORDER BY ex.expense_date DESC, ex.created_at DESC`,
    values,
  )
  return success(res, {
    range: { startDate, endDate },
    summary: { totalExpenses: Number(summary.total_expenses), expenses: Number(summary.expenses), voidedExpenses: Number(summary.voided) },
    breakdowns: [{ title: 'By category', rows: byCategory }],
    rows,
  })
}

export async function profitSummary(req, res) {
  const { startDate, endDate, from, to } = range(req)
  const [[result]] = await pool.query(
    `SELECT
      COALESCE((SELECT SUM(total_amount) FROM sales WHERE sale_status = 'COMPLETED' AND sale_date BETWEEN ? AND ?), 0) AS gross_sales,
      COALESCE((SELECT SUM(si.quantity * IF(si.unit_cost > 0, si.unit_cost, p.cost_price)) FROM sale_items si JOIN products p ON p.id = si.product_id JOIN sales s ON s.id = si.sale_id
                WHERE s.sale_status = 'COMPLETED' AND s.sale_date BETWEEN ? AND ?), 0) AS cogs,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE status = 'ACTIVE' AND expense_date BETWEEN ? AND ?), 0) AS expenses,
      COALESCE((SELECT SUM(total_amount) FROM purchases WHERE status = 'RECEIVED' AND purchase_date BETWEEN ? AND ?), 0) AS purchases`,
    [from, to, from, to, startDate, endDate, startDate, endDate],
  )
  const [byCategory] = await pool.query(
    `SELECT ex.category AS label, COUNT(*) AS count, SUM(ex.amount) AS total FROM expenses ex WHERE ex.status = 'ACTIVE' AND ex.expense_date BETWEEN ? AND ? GROUP BY ex.category ORDER BY total DESC`,
    [startDate, endDate],
  )
  const grossSales = Number(result.gross_sales)
  const cogs = Number(result.cogs)
  const expenses = Number(result.expenses)
  const grossProfit = grossSales - cogs
  const netProfitEstimate = grossProfit - expenses
  return success(res, {
    range: { startDate, endDate },
    calculationNote: 'Cost of goods sold uses the product cost recorded at the time of each sale.',
    grossSales,
    cogs,
    grossProfit,
    expenses,
    netProfitEstimate,
    purchases: Number(result.purchases),
    grossMargin: grossSales ? (grossProfit / grossSales) * 100 : 0,
    netMargin: grossSales ? (netProfitEstimate / grossSales) * 100 : 0,
    breakdowns: [{ title: 'Operating expenses by category', rows: byCategory }],
  })
}

export async function dashboardDetails(req, res) {
  const [trendRows] = await pool.query(
    `SELECT DATE(sale_date) AS sale_date, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS transactions FROM sales
     WHERE sale_status = 'COMPLETED' AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(sale_date)`,
  )
  const byDate = new Map(trendRows.map((row) => [String(row.sale_date).slice(0, 10), row]))
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    const key = localDate(date)
    return { sale_date: key, total: Number(byDate.get(key)?.total || 0), transactions: Number(byDate.get(key)?.transactions || 0) }
  })
  const [topProducts] = await pool.query(
    `SELECT p.product_name, SUM(si.quantity) AS quantity_sold, SUM(si.subtotal) AS sales_amount FROM sale_items si
     JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
     WHERE s.sale_status = 'COMPLETED' AND s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY p.id, p.product_name ORDER BY sales_amount DESC LIMIT 5`,
  )
  const [lowStock] = await pool.query(
    `SELECT p.id, p.product_name, p.unit, p.stock_quantity, p.reorder_level, CASE WHEN p.stock_quantity <= 0 THEN 'OUT OF STOCK' ELSE 'LOW STOCK' END AS stock_status
     FROM products p WHERE p.status = 'ACTIVE' AND p.stock_quantity <= p.reorder_level ORDER BY p.stock_quantity / GREATEST(p.reorder_level, 1), p.product_name LIMIT 6`,
  )
  const mineOnly = req.user.role !== 'OWNER'
  const [recentSales] = await pool.query(
    `SELECT s.id, s.sale_code, s.sale_date, s.total_amount, s.payment_status, s.sale_status, ${EMPLOYEE_NAME} AS employee
     FROM sales s JOIN users u ON u.id = s.created_by LEFT JOIN employees e ON e.id = u.employee_id
     ${mineOnly ? 'WHERE s.created_by = ?' : ''} ORDER BY s.sale_date DESC, s.id DESC LIMIT 6`,
    mineOnly ? [req.user.id] : [],
  )
  const [recentPurchases] = await pool.query(
    `SELECT p.id, p.purchase_code, p.purchase_date, p.total_amount, p.status, s.supplier_name FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
     ORDER BY p.purchase_date DESC, p.created_at DESC LIMIT 6`,
  )
  return success(res, { trend, topProducts, lowStock, recentSales, recentPurchases })
}
