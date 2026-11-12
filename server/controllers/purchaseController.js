import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError, withTransaction } from '../utils/transaction.js'
import { transactionCode } from '../utils/codes.js'
import { isoDate, positiveNumber, required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const money = (value) => Math.round(Number(value) * 100) / 100

function validateItems(items) {
  if (!Array.isArray(items) || !items.length) throw apiError('At least one purchase item is required')
  for (const item of items) {
    required(item.productId, 'Product')
    positiveNumber(item.quantity, 'Quantity')
    positiveNumber(item.unitCost, 'Unit cost')
    required(item.unitCost, 'Unit cost')
    if (!(Number(item.quantity) > 0)) throw apiError('Quantity must be greater than zero')
  }
}

export async function listPurchases(req, res) {
  const { search, status, supplierId, startDate, endDate } = req.query
  isoDate(startDate, 'Start date')
  isoDate(endDate, 'End date')
  const conditions = ['1 = 1']
  const values = []
  if (search) { conditions.push('(p.purchase_code LIKE ? OR s.supplier_name LIKE ?)'); values.push(`%${search}%`, `%${search}%`) }
  if (status) { conditions.push('p.status = ?'); values.push(status) }
  if (supplierId) { conditions.push('p.supplier_id = ?'); values.push(supplierId) }
  if (startDate) { conditions.push('p.purchase_date >= ?'); values.push(startDate) }
  if (endDate) { conditions.push('p.purchase_date <= ?'); values.push(endDate) }
  const [rows] = await pool.query(
    `SELECT p.*, s.supplier_name, CONCAT(e.first_name, ' ', e.last_name) AS created_by_name,
       (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS line_count
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY p.purchase_date DESC, p.created_at DESC LIMIT 500`,
    values,
  )
  return success(res, rows)
}

export async function getPurchase(req, res) {
  const [[purchase]] = await pool.execute(
    `SELECT p.*, s.supplier_name, s.supplier_code, s.contact_person, s.phone AS supplier_phone, CONCAT(e.first_name, ' ', e.last_name) AS created_by_name
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.created_by LEFT JOIN employees e ON e.id = u.employee_id WHERE p.id = ?`,
    [req.params.id],
  )
  if (!purchase) throw apiError('Purchase not found', 404)
  const [items] = await pool.execute('SELECT pi.*, p.product_code, p.product_name, p.unit FROM purchase_items pi JOIN products p ON p.id = pi.product_id WHERE pi.purchase_id = ? ORDER BY pi.id', [req.params.id])
  return success(res, { ...purchase, items })
}

export async function createPurchase(req, res) {
  required(req.body.supplierId, 'Supplier')
  required(req.body.purchaseDate, 'Purchase date')
  isoDate(req.body.purchaseDate, 'Purchase date')
  validateItems(req.body.items)
  positiveNumber(req.body.discount || 0, 'Discount')
  const discount = money(req.body.discount || 0)
  const result = await withTransaction(pool, async (connection) => {
    const [[supplier]] = await connection.execute("SELECT id FROM suppliers WHERE id = ? AND status = 'ACTIVE'", [req.body.supplierId])
    if (!supplier) throw apiError('Active supplier not found', 404)
    const lines = req.body.items.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity), unitCost: money(item.unitCost), subtotal: money(Number(item.quantity) * Number(item.unitCost)) }))
    const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0))
    if (discount > subtotal) throw apiError('Discount cannot exceed subtotal')
    const total = money(subtotal - discount)
    const code = transactionCode('PUR')
    const [purchase] = await connection.execute(
      'INSERT INTO purchases (purchase_code, supplier_id, purchase_date, subtotal, discount, total_amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [code, supplier.id, req.body.purchaseDate, subtotal, discount, total, req.body.notes?.trim() || null, req.user.id],
    )
    for (const line of lines) {
      await connection.execute('INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?)', [purchase.insertId, line.productId, line.quantity, line.unitCost, line.subtotal])
    }
    await logActivity({ userId: req.user.id, action: 'CREATED', module: 'PURCHASE', description: `Created purchase ${code}`, ipAddress: req.ip }, connection)
    return { id: purchase.insertId, purchaseCode: code, subtotal, discount, total }
  })
  return success(res, result, 201)
}

export async function receivePurchase(req, res) {
  const result = await withTransaction(pool, async (connection) => {
    const [[purchase]] = await connection.execute('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [req.params.id])
    if (!purchase) throw apiError('Purchase not found', 404)
    if (purchase.status !== 'PENDING') throw apiError(`Purchase is already ${purchase.status.toLowerCase()} and cannot be received`, 409)
    const [items] = await connection.execute('SELECT * FROM purchase_items WHERE purchase_id = ?', [purchase.id])
    if (!items.length) throw apiError('Purchase has no items')
    for (const item of items) {
      const [[product]] = await connection.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.product_id])
      if (!product) throw apiError('A purchase item references a missing product', 409)
      const previous = Number(product.stock_quantity)
      const next = money(previous + Number(item.quantity))
      await connection.execute('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, product.id])
      await connection.execute(
        "INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, reference_type, reference_id, notes, created_by) VALUES (?, 'PURCHASE', ?, ?, ?, 'PURCHASE', ?, ?, ?)",
        [product.id, Number(item.quantity), previous, next, purchase.id, `Received ${purchase.purchase_code}`, req.user.id],
      )
    }
    await connection.execute("UPDATE purchases SET status = 'RECEIVED' WHERE id = ?", [purchase.id])
    await logActivity({ userId: req.user.id, action: 'RECEIVED', module: 'PURCHASE', description: `Received purchase ${purchase.purchase_code}`, ipAddress: req.ip }, connection)
    return { id: purchase.id, status: 'RECEIVED' }
  })
  return success(res, result)
}

export async function cancelPurchase(req, res) {
  const [[purchase]] = await pool.execute('SELECT purchase_code FROM purchases WHERE id = ?', [req.params.id])
  if (!purchase) throw apiError('Purchase not found', 404)
  const [result] = await pool.execute("UPDATE purchases SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'", [req.params.id])
  if (!result.affectedRows) throw apiError('Only pending purchases can be cancelled', 409)
  const reason = String(req.body?.reason || '').trim()
  await logActivity({ userId: req.user.id, action: 'CANCELLED', module: 'PURCHASE', description: `Cancelled purchase ${purchase.purchase_code}${reason ? `: ${reason}` : ''}`, ipAddress: req.ip })
  return success(res, { id: Number(req.params.id), status: 'CANCELLED' })
}
