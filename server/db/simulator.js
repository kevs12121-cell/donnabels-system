/**
 * Realistic shop-activity generator.
 *
 * Used twice:
 *  1. On first boot (seed) to build ~90 days of history so every page has data.
 *  2. When DEMO_MODE=true, every few minutes to "play" the hours that have passed
 *     since the last run, so the dashboard's "today" figures never go stale.
 *
 * Everything is simulated in memory in chronological order (so stock never goes
 * negative and inventory history is consistent), then written in bulk inside a
 * single transaction.
 */
import { pool } from '../config/db.js'
import { env } from '../config/env.js'
import { withTransaction } from '../utils/transaction.js'
import { compactStamp, localDate, localDateTime } from '../utils/time.js'

const MINUTE = 60_000
export const STATE_KEY = 'system.demo_simulated_until'
const DEMO_PURCHASE_NOTES = ['Auto-restock%', 'Scheduled delivery%']

// Relative customer traffic per opening hour (07:00 – 20:59).
const HOURLY_WEIGHT = { 7: 0.25, 8: 0.45, 9: 0.6, 10: 0.75, 11: 0.85, 12: 0.8, 13: 0.65, 14: 0.6, 15: 0.7, 16: 0.85, 17: 0.95, 18: 0.85, 19: 0.6, 20: 0.3 }
const WEEKDAY_FACTOR = [1.05, 0.75, 0.75, 0.75, 0.8, 0.95, 1.2] // Sunday … Saturday
const CASHIER_DAY_OFF = [0, 3, 1, 4] // Sunday, Wednesday, Monday, Thursday
const ASSEMBLED_GROUPS = new Set(['bouquet', 'arrangement'])
const TARGET_MULTIPLIER = { stems: 4 }
const SHOP_IP = (userId) => `192.168.1.${10 + (Number(userId) % 40)}`

// ---------------------------------------------------------------- helpers
const random = Math.random
const between = (min, max) => min + random() * (max - min)
const int = (min, max) => Math.floor(between(min, max + 1))
const chance = (probability) => random() < probability
const pick = (items) => items[Math.floor(random() * items.length)]
const money = (value) => Math.round(value * 100) / 100
const pad3 = (value) => String(value % 1000).padStart(3, '0')
const dt = (date) => localDateTime(date)

function weighted(entries) {
  const valid = entries.filter(([, weight]) => weight > 0)
  const total = valid.reduce((sum, [, weight]) => sum + weight, 0)
  if (!total) return undefined
  let roll = random() * total
  for (const [value, weight] of valid) {
    roll -= weight
    if (roll <= 0) return value
  }
  return valid[valid.length - 1][0]
}

function poisson(lambda) {
  const limit = Math.exp(-lambda)
  let count = 0
  let product = 1
  do {
    count += 1
    product *= random()
  } while (product > limit)
  return count - 1
}

export const floorHour = (date) => { const copy = new Date(date); copy.setMinutes(0, 0, 0); return copy }
export const startOfDay = (date) => { const copy = new Date(date); copy.setHours(0, 0, 0, 0); return copy }
export const addDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy }
const at = (day, hour, minute = 0, second = 0) => { const copy = new Date(day); copy.setHours(hour, minute, second, 0); return copy }
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * MINUTE)

function groupOf(categoryName = '') {
  const name = categoryName.toLowerCase()
  if (name.includes('fresh')) return 'stems'
  if (name.includes('bouquet')) return 'bouquet'
  if (name.includes('arrangement')) return 'arrangement'
  if (name.includes('plant')) return 'plant'
  if (name.includes('gift')) return 'gift'
  if (name.includes('accessor')) return 'accessory'
  return 'other'
}

function specialDay(day) {
  const month = day.getMonth() + 1
  const date = day.getDate()
  const weekday = day.getDay()
  const key = `${month}-${date}`
  if (key === '2-14') return { factor: 3.2, theme: 'romance' }
  if (key === '2-13' || key === '3-8') return { factor: 1.8, theme: 'romance' }
  if (key === '11-1') return { factor: 2.6, theme: 'remembrance' }
  if (key === '10-31' || key === '11-2') return { factor: 1.7, theme: 'remembrance' }
  if (month === 5 && weekday === 0 && date >= 8 && date <= 14) return { factor: 2.4, theme: 'mothers' }
  if (month === 12 && (date === 23 || date === 24)) return { factor: 1.6, theme: 'holiday' }
  return { factor: 1, theme: null }
}

function productWeight(product, theme) {
  const name = product.name.toLowerCase()
  let weight = 1
  if (name.includes('rose')) weight *= theme === 'romance' ? 3 : 1.6
  if (name.includes('sunflower')) weight *= 1.2
  if (name.includes('chrysanthemum')) weight *= theme === 'remembrance' ? 5 : 0.8
  if (name.includes('funeral') || name.includes('sympathy')) weight *= theme === 'remembrance' ? 6 : 0.35
  if (name.includes('lily')) weight *= theme === 'remembrance' ? 2.5 : 1
  if (name.includes('tulip')) weight *= theme === 'mothers' ? 2 : 0.9
  return weight
}

function templateWeights(theme) {
  const weights = { stems: 33, bouquet: 24, arrangement: 7, plant: 10, gift: 9, accessory: 6, mixed: 8, other: 3 }
  if (theme === 'romance') Object.assign(weights, { bouquet: 40, stems: 36, gift: 16 })
  if (theme === 'remembrance') Object.assign(weights, { arrangement: 26, stems: 40, bouquet: 14, gift: 3 })
  if (theme === 'mothers') Object.assign(weights, { bouquet: 38, plant: 16 })
  return Object.entries(weights)
}

function cashTendered(total) {
  const options = [20, 50, 100, 500, 1000].map((step) => Math.ceil(total / step) * step)
  return weighted([[options[0], 2], [options[1], 3], [options[2], 4], [options[3], 3], [options[4], 1]])
}

function paymentReference(method) {
  const digits = (length) => Array.from({ length }, () => int(0, 9)).join('')
  if (method === 'GCASH') return `${int(1, 9)}${digits(12)}`
  if (method === 'CARD') return `APPR-${digits(6)}`
  if (method === 'BANK_TRANSFER') return `BT${digits(8)}`
  return null
}

// ---------------------------------------------------------------- context
async function loadContext(connection, from, to) {
  const [products] = await connection.query(
    `SELECT p.id, p.product_name, p.stock_quantity, p.reorder_level, p.cost_price, p.selling_price, p.status, c.category_name
     FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.id FOR UPDATE`,
  )
  const [users] = await connection.query(
    `SELECT u.id, u.username, u.role FROM users u LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.status = 'ACTIVE' AND (e.id IS NULL OR e.status = 'ACTIVE') ORDER BY u.id`,
  )
  const [suppliers] = await connection.query('SELECT id, supplier_code, status FROM suppliers ORDER BY id')
  const [pending] = await connection.query(
    `SELECT id, purchase_code, purchase_date FROM purchases WHERE status = 'PENDING' AND (notes LIKE ? OR notes LIKE ?)`,
    DEMO_PURCHASE_NOTES,
  )
  const pendingItems = pending.length
    ? (await connection.query('SELECT purchase_id, product_id, quantity FROM purchase_items WHERE purchase_id IN (?)', [pending.map((row) => row.id)]))[0]
    : []
  const [[ids]] = await connection.query(
    `SELECT (SELECT COALESCE(MAX(id), 0) FROM sales) + 1 AS sale,
            (SELECT COALESCE(MAX(id), 0) FROM purchases) + 1 AS purchase,
            (SELECT COALESCE(MAX(id), 0) FROM expenses) + 1 AS expense`,
  )

  return {
    from,
    to,
    products: new Map(products.map((row) => [row.id, {
      id: row.id,
      name: row.product_name,
      group: groupOf(row.category_name),
      stock: Number(row.stock_quantity),
      reorder: Number(row.reorder_level),
      cost: Number(row.cost_price),
      price: Number(row.selling_price),
      active: row.status === 'ACTIVE',
      changed: false,
    }])),
    owners: users.filter((user) => user.role === 'OWNER'),
    cashiers: users.filter((user) => user.role !== 'OWNER'),
    suppliers: suppliers.filter((supplier) => supplier.status === 'ACTIVE'),
    ids: { sale: Number(ids.sale), purchase: Number(ids.purchase), expense: Number(ids.expense) },
    pending: pending.map((row) => ({
      id: row.id,
      code: row.purchase_code,
      purchaseDate: String(row.purchase_date).slice(0, 10),
      items: pendingItems.filter((item) => item.purchase_id === row.id).map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) })),
      row: null,
    })),
    purchaseUpdates: [],
    sales: [],
    saleItems: [],
    payments: [],
    purchases: [],
    purchaseItems: [],
    inventory: [],
    expenses: [],
    logs: [],
  }
}

function moveStock(ctx, product, delta, type, referenceType, referenceId, notes, userId, ts) {
  const previous = product.stock
  const next = money(previous + delta)
  product.stock = next
  product.changed = true
  ctx.inventory.push([product.id, type, delta, previous, next, referenceType, referenceId, notes, userId, dt(ts)])
}

function log(ctx, userId, action, module, description, ts) {
  ctx.logs.push([userId, action, module, description.slice(0, 255), SHOP_IP(userId), dt(ts)])
}

function roster(ctx, day) {
  const weekday = day.getDay()
  const onDuty = ctx.cashiers.filter((user, index) => weekday !== CASHIER_DAY_OFF[index % CASHIER_DAY_OFF.length])
  const owner = ctx.owners[0] || null
  const cashiers = onDuty.length ? onDuty : ctx.cashiers.slice(0, 1)
  return { owner, cashiers, anyone: owner || cashiers[0], staff: () => pick(cashiers) || owner }
}

function activeProducts(ctx, group) {
  return [...ctx.products.values()].filter((product) => product.active && (!group || product.group === group))
}

function supplierFor(ctx, group, day) {
  const byCode = (code) => ctx.suppliers.find((supplier) => supplier.supplier_code === code)
  const preferred = {
    stems: day.getDate() % 2 ? 'SUP-001' : 'SUP-005',
    plant: 'SUP-002',
    gift: 'SUP-004',
    accessory: 'SUP-003',
    other: 'SUP-002',
  }[group]
  return byCode(preferred) || byCode('SUP-001') || ctx.suppliers[0] || null
}

// ---------------------------------------------------------------- events
function createPurchase(ctx, { supplierId, items, ts, userId, notes, status, purchaseDate = localDate(ts) }) {
  const id = ctx.ids.purchase++
  const code = `PUR-${compactStamp(ts)}-${pad3(id)}`
  const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0))
  const discount = subtotal > 6000 && chance(0.3) ? Math.round(subtotal * 0.02) : 0
  const row = { id, code, supplierId, purchaseDate, subtotal, discount, total: money(subtotal - discount), status, notes, userId, createdAt: ts, updatedAt: ts }
  ctx.purchases.push(row)
  for (const item of items) ctx.purchaseItems.push([id, item.productId, item.quantity, item.unitCost, money(item.quantity * item.unitCost), dt(ts)])
  log(ctx, userId, 'CREATED', 'PURCHASE', `Created purchase ${code}`, ts)
  if (status === 'PENDING') ctx.pending.push({ id, code, purchaseDate, items, row })
  return row
}

function restock(ctx, day, ts, crew) {
  const alreadyOrdered = new Set(ctx.pending.flatMap((purchase) => purchase.items.map((item) => item.productId)))
  const bySupplier = new Map()
  for (const product of activeProducts(ctx)) {
    if (ASSEMBLED_GROUPS.has(product.group) || alreadyOrdered.has(product.id)) continue
    if (product.stock > product.reorder * 1.5) continue
    const target = Math.max(product.reorder * (TARGET_MULTIPLIER[product.group] || 3), product.reorder + 5)
    let quantity = Math.ceil(target - product.stock)
    if (product.group === 'stems' && quantity >= 10) quantity = Math.ceil(quantity / 5) * 5
    if (quantity <= 0) continue
    const supplier = supplierFor(ctx, product.group, day)
    if (!supplier) continue
    if (!bySupplier.has(supplier.id)) bySupplier.set(supplier.id, [])
    bySupplier.get(supplier.id).push({ productId: product.id, quantity, unitCost: product.cost })
  }
  for (const [supplierId, items] of bySupplier) {
    createPurchase(ctx, { supplierId, items, ts, userId: crew.anyone.id, notes: 'Auto-restock: morning supplier order', status: 'PENDING' })
  }
}

function receiveDeliveries(ctx, day, ts, crew) {
  const today = localDate(day)
  const due = ctx.pending.filter((purchase) => purchase.purchaseDate <= today)
  for (const purchase of due) {
    const receiver = crew.staff()
    for (const item of purchase.items) {
      const product = ctx.products.get(item.productId)
      if (product) moveStock(ctx, product, item.quantity, 'PURCHASE', 'PURCHASE', purchase.id, `Received ${purchase.code}`, receiver.id, ts)
    }
    if (purchase.row) {
      purchase.row.status = 'RECEIVED'
      purchase.row.updatedAt = ts
    } else {
      ctx.purchaseUpdates.push({ id: purchase.id, status: 'RECEIVED', updatedAt: ts })
    }
    log(ctx, receiver.id, 'RECEIVED', 'PURCHASE', `Received purchase ${purchase.code}`, ts)
  }
  ctx.pending = ctx.pending.filter((purchase) => !due.includes(purchase))
}

function prepareArrangements(ctx, ts, crew) {
  for (const product of activeProducts(ctx)) {
    if (!ASSEMBLED_GROUPS.has(product.group) || product.stock > product.reorder + 1) continue
    const quantity = Math.max(2, Math.ceil(product.reorder * 3 - product.stock))
    moveStock(ctx, product, quantity, 'STOCK_IN', 'PRODUCTION', null, 'Assembled by florist team', crew.anyone.id, ts)
    log(ctx, crew.anyone.id, 'STOCK_IN', 'INVENTORY', `Prepared ${quantity} × ${product.name}`, ts)
  }
}

function adjustDown(ctx, product, target, reason, userId, ts) {
  if (product.stock <= target) return
  const previous = product.stock
  moveStock(ctx, product, money(target - previous), 'ADJUSTMENT', 'MANUAL_ADJUSTMENT', null, reason, userId, ts)
  log(ctx, userId, 'ADJUSTED', 'INVENTORY', `Adjusted ${product.name} from ${previous} to ${target}`, ts)
}

function spoilage(ctx, ts, crew) {
  const candidates = activeProducts(ctx, 'stems').filter((product) => product.stock >= 8)
  for (let index = 0; index < 2 && candidates.length; index += 1) {
    const product = candidates.splice(Math.floor(random() * candidates.length), 1)[0]
    adjustDown(ctx, product, product.stock - int(2, 5), 'Spoilage - wilted stems removed from display', crew.anyone.id, ts)
  }
}

function buildSaleLines(ctx, theme) {
  const lines = new Map()
  const choose = (group) => weighted(activeProducts(ctx, group).filter((product) => product.stock >= 1).map((product) => [product, productWeight(product, theme)]))
  const addLine = (product, quantity) => {
    if (!product) return
    const already = lines.get(product.id) || 0
    const allowed = Math.min(quantity, Math.floor(product.stock - already))
    if (allowed > 0) lines.set(product.id, already + allowed)
  }
  const addOn = (keyword, probability, quantity = 1) => {
    if (!chance(probability)) return
    addLine(activeProducts(ctx).find((product) => product.name.toLowerCase().includes(keyword)), quantity)
  }

  const template = weighted(templateWeights(theme))
  if (template === 'stems') {
    const quantity = weighted([[1, 10], [2, 6], [3, 10], [6, 12], [12, 10], [24, 3]])
    addLine(choose('stems'), quantity)
    addOn('wrapping', 0.65, quantity > 6 ? 2 : 1)
    addOn('ribbon', 0.45)
  } else if (template === 'mixed') {
    addLine(choose('stems'), pick([3, 5, 6]))
    addLine(choose('stems'), pick([3, 5, 6]))
    addOn('wrapping', 0.8, 2)
    addOn('ribbon', 0.6)
  } else if (template === 'bouquet') {
    addLine(choose('bouquet'), chance(0.1) ? 2 : 1)
    addOn('card', 0.3)
    addOn('chocolate', 0.15)
    addOn('teddy', 0.08)
  } else if (template === 'arrangement') {
    addLine(choose('arrangement'), 1)
    addOn('card', 0.25)
  } else if (template === 'plant') {
    addLine(choose('plant'), chance(0.25) ? 2 : 1)
  } else if (template === 'gift') {
    addLine(choose('gift'), chance(0.15) ? 2 : 1)
    addOn('card', 0.4)
  } else if (template === 'accessory') {
    addLine(choose('accessory'), int(1, 3))
  } else {
    addLine(choose('other'), 1)
  }
  if (!lines.size) addLine(choose('stems') || choose(), pick([1, 3, 6]))
  return [...lines].map(([productId, quantity]) => ({ product: ctx.products.get(productId), quantity }))
}

function voidSale(ctx, sale, lines, owner, ts) {
  for (const line of lines) moveStock(ctx, line.product, line.quantity, 'RETURN', 'SALE_VOID', sale.id, `Voided ${sale.code}`, owner.id, ts)
  sale.status = 'VOIDED'
  sale.updatedAt = ts
  log(ctx, owner.id, 'VOIDED', 'SALE', `Voided sale ${sale.code}: ${pick(['customer cancelled order', 'wrong item entered', 'duplicate transaction'])}`, ts)
}

function makeSale(ctx, ts, theme, crew, schedule) {
  const lines = buildSaleLines(ctx, theme)
  if (!lines.length) return
  const cashier = weighted([...crew.cashiers.map((user) => [user, 1]), ...(crew.owner ? [[crew.owner, 0.4]] : [])]) || crew.anyone
  const id = ctx.ids.sale++
  const code = `SALE-${compactStamp(ts)}-${pad3(id)}`
  let subtotal = 0
  for (const line of lines) {
    line.unitPrice = line.product.price
    line.subtotal = money(line.quantity * line.unitPrice)
    subtotal += line.subtotal
  }
  subtotal = money(subtotal)
  const discount = subtotal >= 800 && chance(0.1) ? Math.round((subtotal * pick([0.05, 0.1])) / 5) * 5 : 0
  const total = money(subtotal - discount)
  const method = weighted([['CASH', 52], ['GCASH', 30], ['CARD', 9], ['BANK_TRANSFER', 6], ['OTHER', 3]])
  const amountPaid = method === 'CASH' ? cashTendered(total) : total
  const sale = { id, code, ts, subtotal, discount, total, amountPaid, change: money(amountPaid - total), status: 'COMPLETED', userId: cashier.id, updatedAt: ts }
  ctx.sales.push(sale)
  for (const line of lines) {
    ctx.saleItems.push([id, line.product.id, line.quantity, line.unitPrice, line.product.cost, 0, line.subtotal, dt(ts)])
    moveStock(ctx, line.product, -line.quantity, 'SALE', 'SALE', id, `Sale ${code}`, cashier.id, ts)
  }
  ctx.payments.push([id, paymentReference(method), method, amountPaid, dt(ts), cashier.id, null, dt(ts)])
  log(ctx, cashier.id, 'COMPLETED', 'SALE', `Completed sale ${code}`, ts)
  if (crew.owner && chance(0.015)) schedule(addMinutes(ts, int(4, 25)), (voidTs) => voidSale(ctx, sale, lines, crew.owner, voidTs))
}

function makeExpense(ctx, ts, { category, description, amount, method, user }) {
  const id = ctx.ids.expense++
  const code = `EXP-${compactStamp(ts)}-${pad3(id)}`
  const voided = chance(0.02)
  const updatedAt = voided ? addMinutes(ts, int(20, 90)) : ts
  ctx.expenses.push([id, code, category, description, amount, localDate(ts), method, voided ? 'VOIDED' : 'ACTIVE', user.id, dt(ts), dt(updatedAt)])
  log(ctx, user.id, 'CREATED', 'EXPENSE', `Recorded expense ${code} (${category})`, ts)
  if (voided && ctx.owners[0]) log(ctx, ctx.owners[0].id, 'VOIDED', 'EXPENSE', `Voided expense ${code}: duplicate entry`, updatedAt)
}

function expensesFor(day, crew) {
  const date = day.getDate()
  const weekday = day.getDay()
  const lastDate = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
  const owner = crew.owner || crew.anyone
  const list = []
  if (date === 1) list.push([9, 'Rent', 'Monthly shop space rental', 18000, 'BANK_TRANSFER', owner])
  if (date === 7) list.push([10, 'Utilities', 'Electricity bill', int(4200, 6200), 'GCASH', owner])
  if (date === 12) list.push([10, 'Utilities', 'Water bill', int(650, 1050), 'GCASH', owner])
  if (date === 18) list.push([11, 'Utilities', 'Internet and phone plan', 1699, 'BANK_TRANSFER', owner])
  if (date === 20) list.push([15, 'Maintenance', 'Flower chiller maintenance', int(1200, 2000), 'CASH', owner])
  if ([3, 13, 23].includes(date)) list.push([13, 'Supplies', 'Floral foam, tape and wire', int(380, 1150), 'CASH', crew.staff()])
  if (date === 15 || date === lastDate) list.push([17, 'Other', 'Staff meal allowance', int(900, 1400), 'CASH', owner])
  if (weekday === 1 || weekday === 4) list.push([16, 'Transportation', 'Delivery van fuel', int(450, 950), 'CASH', crew.staff()])
  if (weekday === 3) list.push([12, 'Packaging', 'Bouquet sleeves, boxes and tissue paper', int(650, 1600), 'CASH', crew.staff()])
  if (chance(0.12)) list.push([int(10, 18), 'Transportation', 'Same-day delivery rider fee', int(150, 350), 'GCASH', crew.staff()])
  return list
}

function simulateDay(ctx, day, seedPlan) {
  const events = []
  const add = (ts, run) => { if (ts > ctx.from && ts <= ctx.to) events.push({ ts, run }) }
  const { factor, theme } = specialDay(day)
  const weekday = day.getDay()
  const crew = roster(ctx, day)
  if (!crew.anyone) return

  const onDuty = [...new Set([crew.owner, ...crew.cashiers].filter(Boolean))]
  for (const user of onDuty) {
    const loginMinute = user.role === 'OWNER' ? int(15, 40) : int(0, 12)
    add(at(day, 7, loginMinute, int(0, 59)), (ts) => log(ctx, user.id, 'LOGIN', 'AUTH', 'User logged in', ts))
    add(at(day, 20, int(45, 59), int(0, 59)), (ts) => log(ctx, user.id, 'LOGOUT', 'AUTH', 'User logged out', ts))
  }

  if (seedPlan?.isFirstDay) {
    add(at(day, 6, 0), (ts) => {
      for (const product of activeProducts(ctx)) {
        const opening = Math.max(Math.ceil(product.reorder * (TARGET_MULTIPLIER[product.group] || 3)), 5)
        if (product.stock < opening) moveStock(ctx, product, opening - product.stock, 'STOCK_IN', 'OPENING', null, 'Opening balance', crew.anyone.id, ts)
      }
      log(ctx, crew.anyone.id, 'STOCK_IN', 'INVENTORY', 'Recorded opening stock balances', ts)
    })
  }

  add(at(day, 7, int(10, 25), int(0, 59)), (ts) => restock(ctx, day, ts, crew))
  add(at(day, 8, int(0, 30), int(0, 59)), (ts) => prepareArrangements(ctx, ts, crew))
  add(at(day, 14, int(10, 40), int(0, 59)), (ts) => receiveDeliveries(ctx, day, ts, crew))
  if (weekday === 6) add(at(day, 19, int(30, 50), int(0, 59)), (ts) => spoilage(ctx, ts, crew))

  for (const [hour, category, description, amount, method, user] of expensesFor(day, crew)) {
    add(at(day, hour, int(0, 59), int(0, 59)), (ts) => makeExpense(ctx, ts, { category, description, amount, method, user }))
  }

  for (const [hour, weight] of Object.entries(HOURLY_WEIGHT)) {
    const count = poisson(weight * WEEKDAY_FACTOR[weekday] * factor)
    for (let index = 0; index < count; index += 1) {
      add(at(day, Number(hour), int(0, 59), int(0, 59)), (ts, schedule) => makeSale(ctx, ts, theme, crew, schedule))
    }
  }

  if (seedPlan?.cancelledPurchaseDay) {
    add(at(day, 10, int(0, 30)), (ts) => {
      const items = activeProducts(ctx, 'plant').slice(0, 3).map((product) => ({ productId: product.id, quantity: 6, unitCost: product.cost }))
      const supplier = supplierFor(ctx, 'plant', day)
      if (!items.length || !supplier) return
      const row = createPurchase(ctx, { supplierId: supplier.id, items, ts, userId: crew.anyone.id, notes: 'Supplier could not fulfil this order', status: 'CANCELLED' })
      row.updatedAt = addMinutes(ts, 95)
      log(ctx, crew.anyone.id, 'CANCELLED', 'PURCHASE', `Cancelled purchase ${row.code}`, row.updatedAt)
    })
  }

  events.sort((a, b) => a.ts - b.ts)
  for (let index = 0; index < events.length; index += 1) {
    const schedule = (ts, run) => {
      if (ts > ctx.to) return
      let position = index + 1
      while (position < events.length && events[position].ts <= ts) position += 1
      events.splice(position, 0, { ts, run })
    }
    events[index].run(events[index].ts, schedule)
  }
}

/** Seed-only finishing touches so the owner sees pending deliveries and stock alerts. */
function finishSeed(ctx) {
  const crew = roster(ctx, ctx.to)
  if (!crew.anyone) return
  const ts = addMinutes(ctx.to, -35)
  const tomorrow = localDate(addDays(ctx.to, 1))
  const byName = (keyword) => activeProducts(ctx).find((product) => product.name.toLowerCase().includes(keyword))

  const giftItems = ['teddy', 'chocolate'].map(byName).filter(Boolean)
  const accessoryItems = ['vase', 'ribbon'].map(byName).filter(Boolean)
  for (const [group, products] of [['gift', giftItems], ['accessory', accessoryItems]]) {
    const supplier = supplierFor(ctx, group, ctx.to)
    if (!supplier || !products.length) continue
    createPurchase(ctx, {
      supplierId: supplier.id,
      items: products.map((product) => ({ productId: product.id, quantity: Math.max(10, Math.ceil(product.reorder * 2)), unitCost: product.cost })),
      ts,
      userId: crew.owner?.id || crew.anyone.id,
      notes: 'Scheduled delivery: weekly supplier order',
      status: 'PENDING',
      purchaseDate: tomorrow,
    })
  }

  const tulip = byName('tulip') || activeProducts(ctx, 'stems')[0]
  if (tulip) adjustDown(ctx, tulip, 0, 'Spoilage - heat-damaged batch discarded', crew.anyone.id, addMinutes(ctx.to, -25))
  const teddy = byName('teddy')
  if (teddy) adjustDown(ctx, teddy, Math.max(1, Math.floor(teddy.reorder * 0.6)), 'Damaged during handling', crew.anyone.id, addMinutes(ctx.to, -20))
}

// ---------------------------------------------------------------- persistence
async function insertRows(connection, table, columns, rows) {
  for (let index = 0; index < rows.length; index += 400) {
    await connection.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [rows.slice(index, index + 400)])
  }
}

export async function saveState(connection, until) {
  await connection.query(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [STATE_KEY, dt(until)],
  )
}

async function persist(connection, ctx) {
  await insertRows(connection, 'purchases', ['id', 'purchase_code', 'supplier_id', 'purchase_date', 'subtotal', 'discount', 'total_amount', 'status', 'notes', 'created_by', 'created_at', 'updated_at'],
    ctx.purchases.map((row) => [row.id, row.code, row.supplierId, row.purchaseDate, row.subtotal, row.discount, row.total, row.status, row.notes, row.userId, dt(row.createdAt), dt(row.updatedAt)]))
  await insertRows(connection, 'purchase_items', ['purchase_id', 'product_id', 'quantity', 'unit_cost', 'subtotal', 'created_at'], ctx.purchaseItems)
  await insertRows(connection, 'sales', ['id', 'sale_code', 'sale_date', 'subtotal', 'discount', 'total_amount', 'amount_paid', 'change_amount', 'payment_status', 'sale_status', 'created_by', 'created_at', 'updated_at'],
    ctx.sales.map((sale) => [sale.id, sale.code, dt(sale.ts), sale.subtotal, sale.discount, sale.total, sale.amountPaid, sale.change, 'PAID', sale.status, sale.userId, dt(sale.ts), dt(sale.updatedAt)]))
  await insertRows(connection, 'sale_items', ['sale_id', 'product_id', 'quantity', 'unit_price', 'unit_cost', 'discount', 'subtotal', 'created_at'], ctx.saleItems)
  await insertRows(connection, 'payments', ['sale_id', 'payment_reference', 'payment_method', 'amount', 'payment_date', 'received_by', 'notes', 'created_at'], ctx.payments)
  await insertRows(connection, 'expenses', ['id', 'expense_code', 'category', 'description', 'amount', 'expense_date', 'payment_method', 'status', 'created_by', 'created_at', 'updated_at'], ctx.expenses)
  await insertRows(connection, 'inventory_transactions', ['product_id', 'transaction_type', 'quantity', 'previous_stock', 'new_stock', 'reference_type', 'reference_id', 'notes', 'created_by', 'created_at'], ctx.inventory)
  ctx.logs.sort((a, b) => (a[5] < b[5] ? -1 : a[5] > b[5] ? 1 : 0))
  await insertRows(connection, 'activity_logs', ['user_id', 'action', 'module', 'description', 'ip_address', 'created_at'], ctx.logs)
  for (const product of ctx.products.values()) {
    if (product.changed) await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [product.stock, product.id])
  }
  for (const update of ctx.purchaseUpdates) {
    await connection.query('UPDATE purchases SET status = ?, updated_at = ? WHERE id = ? AND status = ?', [update.status, dt(update.updatedAt), update.id, 'PENDING'])
  }
  await saveState(connection, ctx.to)
}

/** Simulates shop activity in the window (from, to] using the given transaction connection. */
export async function simulate(connection, { from, to, seed = false }) {
  const ctx = await loadContext(connection, from, to)
  if (!ctx.products.size || (!ctx.owners.length && !ctx.cashiers.length)) {
    await saveState(connection, to)
    return null
  }
  const firstDay = startOfDay(from)
  const totalDays = Math.round((startOfDay(to) - firstDay) / 86_400_000)
  for (let day = firstDay, index = 0; day <= to; day = addDays(day, 1), index += 1) {
    simulateDay(ctx, day, seed ? { isFirstDay: index === 0, cancelledPurchaseDay: index === totalDays - 24 } : null)
  }
  if (seed) finishSeed(ctx)
  await persist(connection, ctx)
  return { sales: ctx.sales.length, purchases: ctx.purchases.length, expenses: ctx.expenses.length, movements: ctx.inventory.length }
}

// ---------------------------------------------------------------- live demo mode
let timer = null
let running = false

async function tick() {
  if (running) return
  running = true
  try {
    const to = floorHour(new Date())
    const [[row]] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', [STATE_KEY])
    let from = row?.setting_value ? new Date(String(row.setting_value).replace(' ', 'T')) : null
    if (!from || Number.isNaN(from.getTime())) {
      await saveState(pool, to)
      return
    }
    const earliest = addDays(to, -14)
    if (from < earliest) from = earliest
    if (to <= from) return
    const result = await withTransaction(pool, (connection) => simulate(connection, { from, to }))
    if (result) console.log(`[demo] Simulated ${dt(from)} → ${dt(to)}: ${result.sales} sales, ${result.purchases} purchases, ${result.expenses} expenses`)
  } finally {
    running = false
  }
}

export function startDemoSimulator({ intervalMs = 10 * MINUTE } = {}) {
  if (!env.demoMode || timer) return
  const run = () => tick().catch((error) => console.error('[demo] Simulation tick failed:', error.message))
  run()
  timer = setInterval(run, intervalMs)
  timer.unref?.()
  console.log('[demo] Live demo activity is enabled (DEMO_MODE=true)')
}
