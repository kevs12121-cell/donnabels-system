import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError } from '../utils/transaction.js'
import { transactionCode } from '../utils/codes.js'
import { isoDate, positiveNumber, required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const CATEGORIES = ['Utilities', 'Transportation', 'Supplies', 'Rent', 'Maintenance', 'Packaging', 'Other']
const METHODS = ['CASH', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER']

function validateExpense(body, { partial = false } = {}) {
  const has = (field) => !partial || body[field] !== undefined
  if (has('category')) { required(body.category, 'Category'); if (!CATEGORIES.includes(body.category)) throw apiError('Invalid expense category') }
  if (has('description')) required(body.description, 'Description')
  if (has('expenseDate')) { required(body.expenseDate, 'Expense date'); isoDate(body.expenseDate, 'Expense date') }
  if (has('amount')) { required(body.amount, 'Amount'); positiveNumber(body.amount, 'Amount'); if (!(Number(body.amount) > 0)) throw apiError('Amount must be greater than zero') }
  if (has('paymentMethod') && !METHODS.includes(body.paymentMethod)) throw apiError('Invalid payment method')
}

export async function listExpenses(req, res) {
  const { search, category, status, startDate, endDate } = req.query
  isoDate(startDate, 'Start date')
  isoDate(endDate, 'End date')
  const conditions = ['1 = 1']
  const values = []
  if (search) { conditions.push('(ex.expense_code LIKE ? OR ex.category LIKE ? OR ex.description LIKE ?)'); values.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  if (category) { conditions.push('ex.category = ?'); values.push(category) }
  if (status) { conditions.push('ex.status = ?'); values.push(status) }
  if (startDate) { conditions.push('ex.expense_date >= ?'); values.push(startDate) }
  if (endDate) { conditions.push('ex.expense_date <= ?'); values.push(endDate) }
  const [rows] = await pool.query(
    `SELECT ex.*, CONCAT(e.first_name, ' ', e.last_name) AS created_by_name FROM expenses ex
     JOIN users u ON u.id = ex.created_by LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY ex.expense_date DESC, ex.created_at DESC LIMIT 500`,
    values,
  )
  return success(res, rows)
}

export async function createExpense(req, res) {
  const body = req.body || {}
  validateExpense(body)
  const code = transactionCode('EXP')
  const [result] = await pool.execute(
    'INSERT INTO expenses (expense_code, category, description, amount, expense_date, payment_method, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [code, body.category, body.description.trim(), Number(body.amount).toFixed(2), body.expenseDate, body.paymentMethod, req.user.id],
  )
  await logActivity({ userId: req.user.id, action: 'CREATED', module: 'EXPENSE', description: `Recorded expense ${code} (${body.category})`, ipAddress: req.ip })
  return success(res, { id: result.insertId, expenseCode: code }, 201)
}

export async function updateExpense(req, res) {
  const body = req.body || {}
  validateExpense(body, { partial: true })
  const map = { category: 'category', description: 'description', amount: 'amount', expenseDate: 'expense_date', paymentMethod: 'payment_method' }
  const fields = Object.keys(map).filter((field) => body[field] !== undefined)
  if (!fields.length) throw apiError('No fields to update')
  const values = fields.map((field) => (field === 'amount' ? Number(body[field]).toFixed(2) : field === 'description' ? String(body[field]).trim() : body[field]))
  const [result] = await pool.execute(`UPDATE expenses SET ${fields.map((field) => `${map[field]} = ?`).join(', ')} WHERE id = ? AND status = 'ACTIVE'`, [...values, req.params.id])
  if (!result.affectedRows) throw apiError('Active expense not found', 404)
  await logActivity({ userId: req.user.id, action: 'UPDATED', module: 'EXPENSE', description: `Updated expense #${req.params.id}`, ipAddress: req.ip })
  return success(res, { id: Number(req.params.id) })
}

export async function setExpenseStatus(req, res) {
  if (!['ACTIVE', 'VOIDED'].includes(req.body?.status)) throw apiError('Invalid expense status')
  const [[expense]] = await pool.execute('SELECT expense_code FROM expenses WHERE id = ?', [req.params.id])
  if (!expense) throw apiError('Expense not found', 404)
  await pool.execute('UPDATE expenses SET status = ? WHERE id = ?', [req.body.status, req.params.id])
  await logActivity({ userId: req.user.id, action: req.body.status === 'VOIDED' ? 'VOIDED' : 'RESTORED', module: 'EXPENSE', description: `${req.body.status === 'VOIDED' ? 'Voided' : 'Restored'} expense ${expense.expense_code}`, ipAddress: req.ip })
  return success(res, { id: Number(req.params.id), status: req.body.status })
}
