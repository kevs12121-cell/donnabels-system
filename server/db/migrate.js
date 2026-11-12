import { readFile } from 'node:fs/promises'
import { pool } from '../config/db.js'

const schemaFile = new URL('../../database/01_schema.sql', import.meta.url)

async function columnExists(table, column) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column],
  )
  return Number(row.total) > 0
}

/**
 * Creates every table from database/01_schema.sql inside the configured database.
 * The CREATE DATABASE / USE lines are skipped so the same schema works on hosted
 * MySQL instances (e.g. Railway) whose database name is assigned by the provider.
 */
export async function migrate() {
  const sql = (await readFile(schemaFile, 'utf8')).replace(/^\s*--.*$/gm, '')
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^(CREATE\s+DATABASE|USE)\b/i.test(statement))

  for (const statement of statements) await pool.query(statement)

  // Upgrades for databases created with an earlier version of the schema.
  if (!(await columnExists('sale_items', 'unit_cost'))) {
    await pool.query('ALTER TABLE sale_items ADD COLUMN unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER unit_price')
  }
}
