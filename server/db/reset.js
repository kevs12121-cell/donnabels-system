/**
 * Wipes this app's tables and rebuilds them with fresh sample data.
 * Usage: npm run db:reset -- --confirm
 * Intended for demo/test databases only — every record is permanently deleted.
 */
import { pool } from '../config/db.js'
import { migrate } from './migrate.js'
import { seedIfEmpty } from './seed.js'

const TABLES = ['payments', 'sale_items', 'sales', 'purchase_items', 'purchases', 'inventory_transactions', 'expenses', 'activity_logs', 'settings', 'products', 'categories', 'suppliers', 'users', 'employees']

if (!process.argv.includes('--confirm')) {
  console.error('This permanently deletes ALL shop data. Re-run with --confirm to proceed: npm run db:reset -- --confirm')
  process.exit(1)
}

const connection = await pool.getConnection()
try {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of TABLES) await connection.query(`DROP TABLE IF EXISTS \`${table}\``)
  await connection.query('SET FOREIGN_KEY_CHECKS = 1')
} finally {
  connection.release()
}
await migrate()
await seedIfEmpty()
console.log('[reset] Database rebuilt with fresh sample data')
await pool.end()
