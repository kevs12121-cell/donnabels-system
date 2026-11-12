import { pool } from '../config/db.js'

export async function logActivity({ userId, action, module, description, ipAddress }, connection = pool) {
  try {
    await connection.execute(
      'INSERT INTO activity_logs (user_id, action, module, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId || null, action, module, String(description).slice(0, 255), ipAddress || null],
    )
  } catch (error) {
    // Audit logging must never break the business operation that triggered it,
    // unless we are inside a transaction where the caller expects atomicity.
    if (connection !== pool) throw error
    console.error('[activity] Failed to record activity', error.message)
  }
}
