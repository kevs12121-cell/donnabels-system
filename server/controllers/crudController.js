import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError } from '../utils/transaction.js'
import { isoDate, positiveNumber, required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const configs = {
  products: {
    table: 'products',
    module: 'PRODUCT',
    label: (row) => row.product_name,
    fields: ['category_id', 'product_code', 'product_name', 'description', 'unit', 'cost_price', 'selling_price', 'reorder_level'],
    required: { category_id: 'Category', product_code: 'Product code', product_name: 'Product name', unit: 'Unit', cost_price: 'Cost price', selling_price: 'Selling price', reorder_level: 'Reorder level' },
    numbers: { cost_price: 'Cost price', selling_price: 'Selling price', reorder_level: 'Reorder level' },
    listSql: `SELECT p.*, c.category_name,
                CASE WHEN p.stock_quantity <= 0 THEN 'OUT OF STOCK' WHEN p.stock_quantity <= p.reorder_level THEN 'LOW STOCK' ELSE 'IN STOCK' END AS stock_status
              FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.product_name`,
  },
  categories: {
    table: 'categories',
    module: 'CATEGORY',
    label: (row) => row.category_name,
    fields: ['category_name', 'description'],
    required: { category_name: 'Category name' },
    listSql: `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
              FROM categories c ORDER BY c.category_name`,
  },
  suppliers: {
    table: 'suppliers',
    module: 'SUPPLIER',
    label: (row) => row.supplier_name,
    fields: ['supplier_code', 'supplier_name', 'contact_person', 'phone', 'email', 'address'],
    required: { supplier_code: 'Supplier code', supplier_name: 'Supplier name' },
    listSql: `SELECT s.*, (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) AS purchase_count,
                (SELECT MAX(p.purchase_date) FROM purchases p WHERE p.supplier_id = s.id) AS last_purchase_date
              FROM suppliers s ORDER BY s.supplier_name`,
  },
  employees: {
    table: 'employees',
    module: 'EMPLOYEE',
    label: (row) => `${row.first_name} ${row.last_name}`,
    fields: ['employee_code', 'first_name', 'middle_name', 'last_name', 'phone', 'email', 'position', 'hire_date'],
    required: { employee_code: 'Employee code', first_name: 'First name', last_name: 'Last name', position: 'Position' },
    dates: { hire_date: 'Hire date' },
    listSql: `SELECT e.*, u.username, u.role AS account_role FROM employees e
              LEFT JOIN users u ON u.employee_id = e.id ORDER BY e.last_name, e.first_name`,
  },
}

/** Trims strings, turns empty optional values into NULL, and validates the payload. */
function normalize(current, body, { partial }) {
  const fields = partial ? current.fields.filter((field) => body[field] !== undefined) : current.fields
  const values = {}
  for (const field of fields) {
    let value = body[field]
    if (typeof value === 'string') value = value.trim()
    if (value === '' || value === undefined) value = null
    if (current.required[field]) required(value, current.required[field])
    if (current.numbers?.[field]) positiveNumber(value, current.numbers[field])
    if (current.dates?.[field]) isoDate(value, current.dates[field])
    values[field] = value
  }
  return values
}

const ipOf = (req) => req.ip

export async function list(req, res) {
  const [rows] = await pool.query(configs[req.resource].listSql)
  return success(res, rows)
}

export async function getOne(req, res) {
  const current = configs[req.resource]
  const [rows] = await pool.execute(`SELECT * FROM ${current.table} WHERE id = ?`, [req.params.id])
  if (!rows[0]) throw apiError('Record not found', 404)
  return success(res, rows[0])
}

export async function create(req, res) {
  const current = configs[req.resource]
  const values = normalize(current, req.body || {}, { partial: false })
  const fields = Object.keys(values)
  const [result] = await pool.execute(
    `INSERT INTO ${current.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    fields.map((field) => values[field]),
  )
  await logActivity({ userId: req.user.id, action: 'CREATED', module: current.module, description: `Created ${current.module.toLowerCase()} ${current.label(values)}`, ipAddress: ipOf(req) })
  return success(res, { id: result.insertId }, 201)
}

export async function update(req, res) {
  const current = configs[req.resource]
  const values = normalize(current, req.body || {}, { partial: true })
  const fields = Object.keys(values)
  if (!fields.length) throw apiError('No fields to update')
  const [result] = await pool.execute(
    `UPDATE ${current.table} SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((field) => values[field]), req.params.id],
  )
  if (!result.affectedRows) throw apiError('Record not found', 404)
  const [[row]] = await pool.execute(`SELECT * FROM ${current.table} WHERE id = ?`, [req.params.id])
  await logActivity({ userId: req.user.id, action: 'UPDATED', module: current.module, description: `Updated ${current.module.toLowerCase()} ${current.label(row)}`, ipAddress: ipOf(req) })
  return success(res, { id: Number(req.params.id) })
}

export async function setStatus(req, res) {
  const current = configs[req.resource]
  const { status } = req.body || {}
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw apiError('Status must be ACTIVE or INACTIVE')
  const [result] = await pool.execute(`UPDATE ${current.table} SET status = ? WHERE id = ?`, [status, req.params.id])
  if (!result.affectedRows) throw apiError('Record not found', 404)
  const [[row]] = await pool.execute(`SELECT * FROM ${current.table} WHERE id = ?`, [req.params.id])
  await logActivity({ userId: req.user.id, action: status === 'ACTIVE' ? 'ACTIVATED' : 'DEACTIVATED', module: current.module, description: `${status === 'ACTIVE' ? 'Activated' : 'Deactivated'} ${current.module.toLowerCase()} ${current.label(row)}`, ipAddress: ipOf(req) })
  return success(res, { id: Number(req.params.id), status })
}
