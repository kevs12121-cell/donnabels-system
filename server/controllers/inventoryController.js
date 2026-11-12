import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError, withTransaction } from '../utils/transaction.js'
import { positiveNumber, required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const STOCK_STATUS = `CASE WHEN p.stock_quantity <= 0 THEN 'OUT OF STOCK' WHEN p.stock_quantity <= p.reorder_level THEN 'LOW STOCK' ELSE 'IN STOCK' END`

function stockStatus(stock, reorder) {
  if (Number(stock) <= 0) return 'OUT OF STOCK'
  if (Number(stock) <= Number(reorder)) return 'LOW STOCK'
  return 'IN STOCK'
}

export async function listInventory(req, res) {
  const search = `%${req.query.search || ''}%`
  const categoryId = req.query.categoryId || null
  const status = req.query.status || null
  const [rows] = await pool.query(
    `SELECT p.*, c.category_name, ${STOCK_STATUS} AS stock_status, p.stock_quantity * p.cost_price AS stock_value,
       (SELECT MAX(it.created_at) FROM inventory_transactions it WHERE it.product_id = p.id) AS last_movement
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE (p.product_name LIKE ? OR p.product_code LIKE ?)
       AND (? IS NULL OR p.category_id = ?)
       AND (? IS NULL OR ${STOCK_STATUS} = ?)
     ORDER BY p.product_name`,
    [search, search, categoryId, categoryId, status, status],
  )
  return success(res, rows)
}

export async function getInventory(req, res) {
  const [rows] = await pool.execute(`SELECT p.*, c.category_name, ${STOCK_STATUS} AS stock_status FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`, [req.params.productId])
  if (!rows[0]) throw apiError('Product not found', 404)
  const [transactions] = await pool.execute(
    `SELECT it.*, CONCAT(e.first_name, ' ', e.last_name) AS user_name FROM inventory_transactions it
     LEFT JOIN users u ON u.id = it.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE it.product_id = ? ORDER BY it.created_at DESC, it.id DESC LIMIT 50`,
    [req.params.productId],
  )
  return success(res, { product: rows[0], transactions })
}

export async function lowStock(req, res) {
  const [rows] = await pool.query(`SELECT p.*, c.category_name, ${STOCK_STATUS} AS stock_status FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'ACTIVE' AND p.stock_quantity <= p.reorder_level ORDER BY p.stock_quantity ASC, p.product_name`)
  return success(res, rows)
}

export async function adjustStock(req, res) {
  required(req.body.productId, 'Product')
  required(req.body.adjustmentType, 'Adjustment type')
  required(req.body.notes, 'Reason')
  positiveNumber(req.body.quantity, 'Quantity')
  const quantity = Number(req.body.quantity)
  if (!(quantity > 0)) throw apiError('Quantity must be greater than zero')
  if (!['INCREASE', 'DECREASE'].includes(req.body.adjustmentType)) throw apiError('Adjustment type must be INCREASE or DECREASE')
  const result = await withTransaction(pool, async (connection) => {
    const [[product]] = await connection.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [req.body.productId])
    if (!product) throw apiError('Product not found', 404)
    const previous = Number(product.stock_quantity)
    const next = Math.round((req.body.adjustmentType === 'INCREASE' ? previous + quantity : previous - quantity) * 100) / 100
    if (next < 0) throw apiError(`Insufficient stock for ${product.product_name} (only ${previous} on hand)`)
    await connection.execute('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, product.id])
    await connection.execute(
      "INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, reference_type, notes, created_by) VALUES (?, 'ADJUSTMENT', ?, ?, ?, 'MANUAL_ADJUSTMENT', ?, ?)",
      [product.id, req.body.adjustmentType === 'INCREASE' ? quantity : -quantity, previous, next, String(req.body.notes).trim().slice(0, 255), req.user.id],
    )
    await logActivity({ userId: req.user.id, action: 'ADJUSTED', module: 'INVENTORY', description: `Adjusted ${product.product_name} from ${previous} to ${next}`, ipAddress: req.ip }, connection)
    return { productId: product.id, previousStock: previous, newStock: next, status: stockStatus(next, product.reorder_level) }
  })
  return success(res, result)
}
