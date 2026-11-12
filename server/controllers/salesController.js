import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError, withTransaction } from '../utils/transaction.js'
import { transactionCode } from '../utils/codes.js'
import { isoDate, positiveNumber, required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const METHODS = ['CASH', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER']
const money = (value) => Math.round(Number(value) * 100) / 100

function validateItems(items) {
  if (!Array.isArray(items) || !items.length) throw apiError('At least one sale item is required')
  for (const item of items) {
    required(item.productId, 'Product')
    positiveNumber(item.quantity, 'Quantity')
    if (!(Number(item.quantity) > 0)) throw apiError('Quantity must be greater than zero')
  }
}

export async function listSales(req, res) {
  const { search, status, paymentMethod, startDate, endDate, mine } = req.query
  isoDate(startDate, 'Start date')
  isoDate(endDate, 'End date')
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const conditions = ['1 = 1']
  const values = []
  if (search) { conditions.push('s.sale_code LIKE ?'); values.push(`%${search}%`) }
  if (status) { conditions.push('s.sale_status = ?'); values.push(status) }
  if (paymentMethod) { conditions.push('EXISTS (SELECT 1 FROM payments px WHERE px.sale_id = s.id AND px.payment_method = ?)'); values.push(paymentMethod) }
  if (startDate) { conditions.push('s.sale_date >= ?'); values.push(`${startDate} 00:00:00`) }
  if (endDate) { conditions.push('s.sale_date <= ?'); values.push(`${endDate} 23:59:59`) }
  if (mine === 'true') { conditions.push('s.created_by = ?'); values.push(req.user.id) }
  const where = conditions.join(' AND ')

  const [[totals]] = await pool.execute(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN s.sale_status = 'COMPLETED' THEN s.total_amount END), 0) AS amount FROM sales s WHERE ${where}`,
    values,
  )
  const [rows] = await pool.query(
    `SELECT s.*, CONCAT(e.first_name, ' ', e.last_name) AS created_by_name,
       (SELECT GROUP_CONCAT(DISTINCT p.payment_method) FROM payments p WHERE p.sale_id = s.id) AS payment_method,
       (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
     FROM sales s JOIN users u ON u.id = s.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} ORDER BY s.sale_date DESC, s.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const total = Number(totals.total)
  return success(res, { rows, summary: { count: total, completedAmount: Number(totals.amount) }, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } })
}

export async function getSale(req, res) {
  const [[sale]] = await pool.execute(
    `SELECT s.*, CONCAT(e.first_name, ' ', e.last_name) AS created_by_name, u.username AS created_by_username
     FROM sales s JOIN users u ON u.id = s.created_by LEFT JOIN employees e ON e.id = u.employee_id WHERE s.id = ?`,
    [req.params.id],
  )
  if (!sale) throw apiError('Sale not found', 404)
  const [items] = await pool.execute('SELECT si.*, p.product_code, p.product_name, p.unit FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ? ORDER BY si.id', [req.params.id])
  const [payments] = await pool.execute('SELECT * FROM payments WHERE sale_id = ? ORDER BY created_at', [req.params.id])
  return success(res, { ...sale, items, payments })
}

export async function createSale(req, res) {
  validateItems(req.body.items)
  required(req.body.paymentMethod, 'Payment method')
  positiveNumber(req.body.amountPaid, 'Amount paid')
  positiveNumber(req.body.discount || 0, 'Discount')
  if (!METHODS.includes(req.body.paymentMethod)) throw apiError('Invalid payment method')
  const discount = money(req.body.discount || 0)

  // Merge duplicate product lines so stock is checked against the combined quantity.
  const quantities = new Map()
  for (const item of req.body.items) quantities.set(Number(item.productId), (quantities.get(Number(item.productId)) || 0) + Number(item.quantity))

  const result = await withTransaction(pool, async (connection) => {
    const lines = []
    for (const [productId, quantity] of quantities) {
      const [[product]] = await connection.execute("SELECT * FROM products WHERE id = ? AND status = 'ACTIVE' FOR UPDATE", [productId])
      if (!product) throw apiError('One of the products is no longer available', 404)
      if (quantity > Number(product.stock_quantity)) throw apiError(`Insufficient stock for ${product.product_name} (only ${Number(product.stock_quantity)} left)`)
      lines.push({ product, quantity, unitPrice: Number(product.selling_price), unitCost: Number(product.cost_price), subtotal: money(quantity * Number(product.selling_price)) })
    }
    const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0))
    if (discount > subtotal) throw apiError('Discount cannot exceed subtotal')
    const total = money(subtotal - discount)
    const amountPaid = money(req.body.amountPaid)
    if (amountPaid < total) throw apiError('Payment amount is insufficient for this sale')
    const change = money(amountPaid - total)
    const code = transactionCode('SALE')

    const [sale] = await connection.execute(
      "INSERT INTO sales (sale_code, subtotal, discount, total_amount, amount_paid, change_amount, payment_status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'PAID', ?)",
      [code, subtotal, discount, total, amountPaid, change, req.user.id],
    )
    for (const line of lines) {
      const previous = Number(line.product.stock_quantity)
      const next = money(previous - line.quantity)
      await connection.execute(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [sale.insertId, line.product.id, line.quantity, line.unitPrice, line.unitCost, line.subtotal],
      )
      await connection.execute('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, line.product.id])
      await connection.execute(
        "INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, reference_type, reference_id, notes, created_by) VALUES (?, 'SALE', ?, ?, ?, 'SALE', ?, ?, ?)",
        [line.product.id, -line.quantity, previous, next, sale.insertId, `Sale ${code}`, req.user.id],
      )
    }
    await connection.execute(
      'INSERT INTO payments (sale_id, payment_reference, payment_method, amount, received_by, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [sale.insertId, req.body.paymentReference?.trim() || null, req.body.paymentMethod, amountPaid, req.user.id, req.body.paymentNotes?.trim() || null],
    )
    await logActivity({ userId: req.user.id, action: 'COMPLETED', module: 'SALE', description: `Completed sale ${code}`, ipAddress: req.ip }, connection)
    return { id: sale.insertId, saleCode: code, subtotal, discount, total, amountPaid, change }
  })
  return success(res, result, 201)
}

export async function voidSale(req, res) {
  const reason = String(req.body?.reason || '').trim()
  const result = await withTransaction(pool, async (connection) => {
    const [[sale]] = await connection.execute('SELECT * FROM sales WHERE id = ? FOR UPDATE', [req.params.id])
    if (!sale) throw apiError('Sale not found', 404)
    if (sale.sale_status === 'VOIDED') throw apiError('Sale has already been voided', 409)
    const [items] = await connection.execute('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id])
    for (const item of items) {
      const [[product]] = await connection.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.product_id])
      const previous = Number(product.stock_quantity)
      const next = money(previous + Number(item.quantity))
      await connection.execute('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, product.id])
      await connection.execute(
        "INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, reference_type, reference_id, notes, created_by) VALUES (?, 'RETURN', ?, ?, ?, 'SALE_VOID', ?, ?, ?)",
        [product.id, Number(item.quantity), previous, next, sale.id, `Voided ${sale.sale_code}`, req.user.id],
      )
    }
    await connection.execute("UPDATE sales SET sale_status = 'VOIDED' WHERE id = ?", [sale.id])
    await logActivity({ userId: req.user.id, action: 'VOIDED', module: 'SALE', description: `Voided sale ${sale.sale_code}${reason ? `: ${reason}` : ''}`, ipAddress: req.ip }, connection)
    return { id: sale.id, status: 'VOIDED' }
  })
  return success(res, result)
}
