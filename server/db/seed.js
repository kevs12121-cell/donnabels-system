import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { env } from '../config/env.js'
import { withTransaction } from '../utils/transaction.js'
import { addDays, floorHour, saveState, simulate, startOfDay } from './simulator.js'

const HISTORY_DAYS = 90

const employees = [
  ['EMP-001', 'Donna Bel', null, 'Suete', '09171234567', 'donnabel.suete@donzflowers.local', 'Shop Owner', '2023-02-01', 'ACTIVE'],
  ['EMP-002', 'Mara', 'Lopez', 'Reyes', '09181234567', 'mara.reyes@donzflowers.local', 'Cashier', '2024-03-04', 'ACTIVE'],
  ['EMP-003', 'Lina', null, 'Cruz', '09191234567', 'lina.cruz@donzflowers.local', 'Cashier', '2024-05-20', 'ACTIVE'],
  ['EMP-004', 'Paolo', 'Garcia', 'Santos', '09271234567', 'paolo.santos@donzflowers.local', 'Florist', '2024-07-08', 'ACTIVE'],
  ['EMP-005', 'Jessa', null, 'Mendoza', '09281234567', 'jessa.mendoza@donzflowers.local', 'Delivery Staff', '2025-01-13', 'ACTIVE'],
  ['EMP-006', 'Carlo', null, 'Bautista', '09291234567', 'carlo.bautista@donzflowers.local', 'Florist Assistant', '2025-06-02', 'INACTIVE'],
]

// [username, employee code, role, which default password]
const accounts = [
  ['owner', 'EMP-001', 'OWNER', 'owner'],
  ['cashier', 'EMP-002', 'EMPLOYEE', 'cashier'],
  ['lina', 'EMP-003', 'EMPLOYEE', 'cashier'],
]

const categories = [
  ['Fresh Flowers', 'Cut flowers sold per stem or bunch'],
  ['Bouquets', 'Ready-made bouquets assembled in the shop'],
  ['Flower Arrangements', 'Table, basket and occasion arrangements'],
  ['Plants', 'Indoor potted plants and succulents'],
  ['Gift Items', 'Add-on gifts for flower orders'],
  ['Accessories', 'Vases, ribbons and wrapping materials'],
]

// [category, code, name, description, unit, cost, price, reorder level]
const products = [
  ['Fresh Flowers', 'FLW-001', 'Red Rose', 'Long-stem red rose', 'stem', 35, 75, 25],
  ['Fresh Flowers', 'FLW-002', 'White Rose', 'Long-stem white rose', 'stem', 38, 80, 20],
  ['Fresh Flowers', 'FLW-003', 'Pink Rose', 'Long-stem pink rose', 'stem', 36, 78, 20],
  ['Fresh Flowers', 'FLW-004', 'Sunflower', 'Fresh yellow sunflower', 'stem', 45, 95, 15],
  ['Fresh Flowers', 'FLW-005', 'Tulip', 'Imported tulip stem', 'stem', 55, 120, 12],
  ['Fresh Flowers', 'FLW-006', 'Carnation', 'Assorted carnation stem', 'stem', 18, 40, 30],
  ['Fresh Flowers', 'FLW-007', "Baby's Breath", "Baby's breath filler bunch", 'bunch', 60, 130, 10],
  ['Fresh Flowers', 'FLW-008', 'Chrysanthemum', 'White and yellow chrysanthemum', 'stem', 25, 55, 20],
  ['Fresh Flowers', 'FLW-009', 'Stargazer Lily', 'Fragrant stargazer lily', 'stem', 65, 140, 12],
  ['Fresh Flowers', 'FLW-010', 'Gerbera Daisy', 'Bright gerbera daisy', 'stem', 22, 50, 20],
  ['Bouquets', 'BOU-001', 'Mixed Flower Bouquet', 'Seasonal mixed bouquet', 'bouquet', 450, 950, 4],
  ['Bouquets', 'BOU-002', 'Classic Rose Bouquet', 'Dozen red roses with filler', 'bouquet', 650, 1400, 3],
  ['Bouquets', 'BOU-003', 'Sunflower Bouquet', 'Three sunflowers with greens', 'bouquet', 400, 850, 3],
  ['Bouquets', 'BOU-004', 'Pastel Tulip Bouquet', 'Ten pastel tulips', 'bouquet', 700, 1500, 2],
  ['Flower Arrangements', 'ARR-001', 'Tabletop Arrangement', 'Low centerpiece arrangement', 'arrangement', 800, 1800, 2],
  ['Flower Arrangements', 'ARR-002', 'Basket Arrangement', 'Rattan basket with mixed blooms', 'arrangement', 900, 2000, 2],
  ['Flower Arrangements', 'ARR-003', 'Sympathy Standee', 'Funeral and memorial flower stand', 'arrangement', 1500, 3500, 1],
  ['Plants', 'PLT-001', 'Potted Orchid', 'Phalaenopsis orchid in ceramic pot', 'pot', 350, 750, 4],
  ['Plants', 'PLT-002', 'Succulent Trio', 'Three succulents in a wooden tray', 'set', 120, 280, 6],
  ['Plants', 'PLT-003', 'Peace Lily', 'Peace lily in 6-inch pot', 'pot', 250, 550, 4],
  ['Gift Items', 'GFT-001', 'Teddy Bear', 'Plush bear, 12 inches', 'piece', 150, 350, 5],
  ['Gift Items', 'GFT-002', 'Chocolate Box', 'Assorted chocolates, 12 pieces', 'box', 180, 380, 6],
  ['Gift Items', 'GFT-003', 'Greeting Card', 'Occasion greeting card', 'piece', 15, 45, 30],
  ['Accessories', 'ACC-001', 'Decorative Vase', 'Clear glass vase', 'piece', 180, 400, 5],
  ['Accessories', 'ACC-002', 'Satin Ribbon', 'Decorative satin ribbon', 'roll', 40, 100, 8],
  ['Accessories', 'ACC-003', 'Wrapping Paper', 'Korean-style floral wrapping sheet', 'sheet', 15, 45, 20],
]

const suppliers = [
  ['SUP-001', 'Manila Bloom Growers', 'Ramon Dela Cruz', '09201234567', 'orders@manilabloom.local', 'Quezon City', 'ACTIVE'],
  ['SUP-002', 'Garden Lane Wholesale', 'Ana Villanueva', '09211234567', 'sales@gardenlane.local', 'Makati City', 'ACTIVE'],
  ['SUP-003', 'Petal Craft Supplies', 'Joey Navarro', '09221234567', 'hello@petalcraft.local', 'Pasig City', 'ACTIVE'],
  ['SUP-004', 'Sweet Gifts Trading', 'Grace Tan', '09231234567', 'orders@sweetgifts.local', 'Mandaluyong City', 'ACTIVE'],
  ['SUP-005', 'Highland Flower Farms', 'Benjie Carino', '09241234567', 'farm@highlandflowers.local', 'La Trinidad, Benguet', 'ACTIVE'],
  ['SUP-006', 'Dangwa Petal Traders', 'Rose Abad', '09251234567', 'dangwa.petal@local', 'Sampaloc, Manila', 'INACTIVE'],
]

const settings = {
  shop_name: 'Donz Flower Shop',
  currency: 'PHP',
  address: '123 Dahlia Street, Barangay Kamuning, Quezon City',
  phone: '0917 123 4567',
  email: 'hello@donzflowers.local',
  receipt_footer: 'Thank you for choosing Donz Flower Shop!',
}

async function insertBaseData(connection) {
  await connection.query(
    'INSERT INTO employees (employee_code, first_name, middle_name, last_name, phone, email, position, hire_date, status) VALUES ?',
    [employees],
  )
  const [employeeRows] = await connection.query('SELECT id, employee_code FROM employees')
  const employeeId = Object.fromEntries(employeeRows.map((row) => [row.employee_code, row.id]))

  const hashes = {
    owner: await bcrypt.hash(env.defaultPasswords.owner, 10),
    cashier: await bcrypt.hash(env.defaultPasswords.cashier, 10),
  }
  await connection.query(
    'INSERT INTO users (employee_id, username, password_hash, role) VALUES ?',
    [accounts.map(([username, code, role, password]) => [employeeId[code], username, hashes[password], role])],
  )

  await connection.query('INSERT INTO categories (category_name, description) VALUES ?', [categories])
  const [categoryRows] = await connection.query('SELECT id, category_name FROM categories')
  const categoryId = Object.fromEntries(categoryRows.map((row) => [row.category_name, row.id]))

  await connection.query(
    'INSERT INTO products (category_id, product_code, product_name, description, unit, cost_price, selling_price, stock_quantity, reorder_level) VALUES ?',
    [products.map(([category, code, name, description, unit, cost, price, reorder]) => [categoryId[category], code, name, description, unit, cost, price, 0, reorder])],
  )
  await connection.query(
    'INSERT INTO suppliers (supplier_code, supplier_name, contact_person, phone, email, address, status) VALUES ?',
    [suppliers],
  )
  await connection.query('INSERT INTO settings (setting_key, setting_value) VALUES ?', [Object.entries(settings)])
}

/**
 * Seeds an empty database. Returns true when data was inserted.
 * Base data (accounts, catalog, suppliers) is always created for an empty database so the
 * owner can sign in; ~90 days of sample activity is added unless SEED_DEMO_DATA=false.
 */
export async function seedIfEmpty() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM users')
  if (Number(total) > 0) return false

  const to = floorHour(new Date())
  await withTransaction(pool, async (connection) => {
    await insertBaseData(connection)
    if (env.seedDemoData) {
      const result = await simulate(connection, { from: startOfDay(addDays(to, -HISTORY_DAYS)), to, seed: true })
      console.log(`[seed] Generated ${HISTORY_DAYS} days of history:`, result)
    } else {
      await saveState(connection, to)
    }
  })
  return true
}
