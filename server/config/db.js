import mysql from 'mysql2/promise'
import { env } from './env.js'
import { mysqlOffset } from '../utils/time.js'

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  enableKeepAlive: true,
})

// Make CURDATE()/NOW() and TIMESTAMP columns follow the shop timezone.
const offset = mysqlOffset()
pool.on('connection', (connection) => {
  connection.query(`SET time_zone = '${offset}'`)
})

export async function checkDatabase() {
  const connection = await pool.getConnection()
  try {
    await connection.query('SELECT 1')
    return true
  } finally {
    connection.release()
  }
}

export async function waitForDatabase({ attempts = 30, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkDatabase()
      return
    } catch (error) {
      if (attempt === attempts) throw error
      console.log(`[db] Waiting for database (${attempt}/${attempts}): ${error.code || error.message}`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
