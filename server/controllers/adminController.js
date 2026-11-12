import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { success } from '../utils/response.js'
import { apiError, withTransaction } from '../utils/transaction.js'
import { isoDate, required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const ROLES = ['OWNER', 'EMPLOYEE']
const SETTING_KEYS = ['shop_name', 'currency', 'address', 'phone', 'email', 'receipt_footer']

const safeUser = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  username: row.username,
  role: row.role,
  status: row.status,
  lastLogin: row.last_login,
  createdAt: row.created_at,
  firstName: row.first_name,
  lastName: row.last_name,
  position: row.position,
  employeeStatus: row.employee_status,
})

async function activeOwnerCount(excludeId) {
  const [[row]] = await pool.execute("SELECT COUNT(*) AS total FROM users WHERE role = 'OWNER' AND status = 'ACTIVE' AND id <> ?", [excludeId])
  return Number(row.total)
}

export async function listUsers(req, res) {
  const [rows] = await pool.query(
    'SELECT u.*, e.first_name, e.last_name, e.position, e.status AS employee_status FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.role DESC, u.username',
  )
  return success(res, rows.map(safeUser))
}

export async function createUser(req, res) {
  const body = req.body || {}
  required(body.username, 'Username')
  required(body.password, 'Password')
  required(body.employeeId, 'Employee')
  if (String(body.password).length < 8) throw apiError('Password must be at least 8 characters')
  if (!ROLES.includes(body.role)) throw apiError('Invalid role')
  if (!/^[a-z0-9._-]{3,40}$/i.test(String(body.username).trim())) throw apiError('Username must be 3-40 letters, numbers, dots, dashes or underscores')
  const hash = await bcrypt.hash(String(body.password), 10)
  try {
    const [result] = await pool.execute('INSERT INTO users (employee_id, username, password_hash, role) VALUES (?, ?, ?, ?)', [body.employeeId, String(body.username).trim(), hash, body.role])
    await logActivity({ userId: req.user.id, action: 'CREATED', module: 'USER', description: `Created ${body.role === 'OWNER' ? 'owner' : 'cashier'} account ${String(body.username).trim()}`, ipAddress: req.ip })
    return success(res, { id: result.insertId }, 201)
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw apiError('That username is taken or the employee already has an account', 409)
    throw error
  }
}

export async function updateUser(req, res) {
  const body = req.body || {}
  const [[existing]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.params.id])
  if (!existing) throw apiError('User account not found', 404)
  const fields = []
  const values = []
  if (body.username !== undefined) {
    required(body.username, 'Username')
    if (!/^[a-z0-9._-]{3,40}$/i.test(String(body.username).trim())) throw apiError('Username must be 3-40 letters, numbers, dots, dashes or underscores')
    fields.push('username = ?')
    values.push(String(body.username).trim())
  }
  if (body.employeeId !== undefined && body.employeeId !== null && body.employeeId !== '') {
    fields.push('employee_id = ?')
    values.push(body.employeeId)
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw apiError('Invalid role')
    if (existing.role === 'OWNER' && body.role !== 'OWNER' && (await activeOwnerCount(existing.id)) === 0) {
      throw apiError('At least one active owner account must remain in the system', 409)
    }
    fields.push('role = ?')
    values.push(body.role)
  }
  // A blank password on edit means "keep the current password".
  if (body.password !== undefined && body.password !== null && String(body.password) !== '') {
    if (String(body.password).length < 8) throw apiError('Password must be at least 8 characters')
    fields.push('password_hash = ?')
    values.push(await bcrypt.hash(String(body.password), 10))
  }
  if (!fields.length) throw apiError('No account fields to update')
  try {
    await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw apiError('That username is taken or the employee already has an account', 409)
    throw error
  }
  await logActivity({ userId: req.user.id, action: 'UPDATED', module: 'USER', description: `Updated account ${body.username || existing.username}`, ipAddress: req.ip })
  return success(res, { id: Number(req.params.id) })
}

export async function setUserStatus(req, res) {
  const status = req.body?.status
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw apiError('Invalid account status')
  const [[user]] = await pool.execute('SELECT id, username, role, status FROM users WHERE id = ?', [req.params.id])
  if (!user) throw apiError('User account not found', 404)
  if (status === 'INACTIVE' && user.id === req.user.id) throw apiError('You cannot deactivate your own account', 409)
  if (user.role === 'OWNER' && status === 'INACTIVE' && (await activeOwnerCount(user.id)) === 0) {
    throw apiError('At least one active owner account must remain in the system', 409)
  }
  await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id])
  await logActivity({ userId: req.user.id, action: status === 'ACTIVE' ? 'ACTIVATED' : 'DEACTIVATED', module: 'USER', description: `${status === 'ACTIVE' ? 'Activated' : 'Deactivated'} account ${user.username}`, ipAddress: req.ip })
  return success(res, { id: Number(req.params.id), status })
}

export async function changePassword(req, res) {
  const body = req.body || {}
  required(body.currentPassword, 'Current password')
  required(body.newPassword, 'New password')
  required(body.confirmPassword, 'Confirm password')
  if (String(body.newPassword).length < 8) throw apiError('New password must be at least 8 characters')
  if (body.newPassword !== body.confirmPassword) throw apiError('New passwords do not match')
  const [[user]] = await pool.execute("SELECT password_hash FROM users WHERE id = ? AND status = 'ACTIVE'", [req.user.id])
  if (!user || !(await bcrypt.compare(String(body.currentPassword), user.password_hash))) throw apiError('Current password is incorrect', 400)
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(body.newPassword), 10), req.user.id])
  await logActivity({ userId: req.user.id, action: 'PASSWORD_CHANGED', module: 'AUTH', description: 'Changed account password', ipAddress: req.ip })
  return success(res, { message: 'Password changed successfully' })
}

export async function settings(req, res) {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?)', [SETTING_KEYS])
  return success(res, Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])))
}

export async function updateSettings(req, res) {
  const entries = Object.entries(req.body || {}).filter(([key]) => SETTING_KEYS.includes(key))
  if (!entries.length) throw apiError('No settings to update')
  if (entries.some(([key, value]) => key === 'shop_name' && !String(value || '').trim())) throw apiError('Shop name is required')
  await withTransaction(pool, async (connection) => {
    for (const [key, value] of entries) {
      await connection.execute(
        'INSERT INTO settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)',
        [key, String(value ?? '').trim().slice(0, 1000), req.user.id],
      )
    }
  })
  await logActivity({ userId: req.user.id, action: 'UPDATED', module: 'SETTINGS', description: 'Updated shop settings', ipAddress: req.ip })
  return success(res, Object.fromEntries(entries))
}

export async function activityLogs(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  isoDate(req.query.startDate, 'Start date')
  isoDate(req.query.endDate, 'End date')
  const conditions = ['1 = 1']
  const values = []
  if (req.query.search) {
    conditions.push('(a.action LIKE ? OR a.module LIKE ? OR a.description LIKE ? OR u.username LIKE ?)')
    values.push(...Array(4).fill(`%${req.query.search}%`))
  }
  if (req.query.module) { conditions.push('a.module = ?'); values.push(req.query.module) }
  if (req.query.action) { conditions.push('a.action = ?'); values.push(req.query.action) }
  if (req.query.userId) { conditions.push('a.user_id = ?'); values.push(req.query.userId) }
  if (req.query.startDate) { conditions.push('a.created_at >= ?'); values.push(`${req.query.startDate} 00:00:00`) }
  if (req.query.endDate) { conditions.push('a.created_at <= ?'); values.push(`${req.query.endDate} 23:59:59`) }
  const where = conditions.join(' AND ')
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${where}`, values)
  const [rows] = await pool.query(
    `SELECT a.id, a.created_at, a.action, a.module, a.description, a.ip_address, u.username, u.role, CONCAT(e.first_name, ' ', e.last_name) AS user_name
     FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN employees e ON e.id = u.employee_id
     WHERE ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const [modules] = await pool.query('SELECT DISTINCT module FROM activity_logs ORDER BY module')
  const total = Number(count.total)
  return success(res, { rows, modules: modules.map((row) => row.module), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } })
}
