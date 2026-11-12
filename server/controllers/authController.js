import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'
import { env } from '../config/env.js'
import { success } from '../utils/response.js'
import { apiError } from '../utils/transaction.js'
import { required } from '../utils/validation.js'
import { logActivity } from '../services/activityService.js'

const safeUser = (user) => ({
  id: user.id,
  employeeId: user.employee_id,
  username: user.username,
  role: user.role,
  status: user.status,
  firstName: user.first_name,
  lastName: user.last_name,
  position: user.position,
  lastLogin: user.last_login,
})

const USER_QUERY = `SELECT u.*, e.first_name, e.last_name, e.position, e.status AS employee_status
  FROM users u LEFT JOIN employees e ON e.id = u.employee_id`

const isActive = (user) => user && user.status === 'ACTIVE' && (!user.employee_id || user.employee_status === 'ACTIVE')

export async function login(req, res) {
  required(req.body?.username, 'Username')
  required(req.body?.password, 'Password')
  const [rows] = await pool.execute(`${USER_QUERY} WHERE u.username = ? LIMIT 1`, [String(req.body.username).trim()])
  const user = rows[0]
  if (!isActive(user) || !(await bcrypt.compare(String(req.body.password), user.password_hash))) {
    throw apiError('Invalid username or password', 401)
  }
  await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id])
  await logActivity({ userId: user.id, action: 'LOGIN', module: 'AUTH', description: 'User logged in', ipAddress: req.ip })
  const token = jwt.sign({ id: user.id, employeeId: user.employee_id, role: user.role }, env.jwtSecret, { expiresIn: '12h' })
  return success(res, { token, user: safeUser(user) })
}

export async function me(req, res) {
  const [rows] = await pool.execute(`${USER_QUERY} WHERE u.id = ? LIMIT 1`, [req.user.id])
  if (!isActive(rows[0])) throw apiError('User account is inactive', 401)
  return success(res, { user: safeUser(rows[0]) })
}

export async function logout(req, res) {
  await logActivity({ userId: req.user.id, action: 'LOGOUT', module: 'AUTH', description: 'User logged out', ipAddress: req.ip })
  return success(res, { message: 'Session ended' })
}
