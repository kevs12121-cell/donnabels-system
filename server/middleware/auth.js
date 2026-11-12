import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

export async function authenticateToken(req, res, next) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' })
  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret)
  } catch {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' })
  }
  try {
    // Re-read the account so deactivations and role changes apply immediately.
    const [[user]] = await pool.execute(
      'SELECT u.id, u.role, u.status, u.employee_id, e.status AS employee_status FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = ?',
      [payload.id],
    )
    if (!user || user.status !== 'ACTIVE' || (user.employee_id && user.employee_status !== 'ACTIVE')) {
      return res.status(401).json({ success: false, message: 'Your account is no longer active' })
    }
    req.user = { id: user.id, employeeId: user.employee_id, role: user.role }
    return next()
  } catch (error) {
    return next(error)
  }
}

export function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' })
    }
    next()
  }
}
