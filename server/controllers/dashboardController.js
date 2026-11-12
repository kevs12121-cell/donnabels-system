import { pool } from '../config/db.js'
import { success } from '../utils/response.js'

export async function summary(req, res) {
  const [[row]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM products WHERE status = 'ACTIVE') AS total_products,
      (SELECT COUNT(*) FROM products WHERE status = 'ACTIVE' AND stock_quantity > 0 AND stock_quantity <= reorder_level) AS low_stock,
      (SELECT COUNT(*) FROM products WHERE status = 'ACTIVE' AND stock_quantity <= 0) AS out_of_stock,
      (SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE') AS employees,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE sale_status = 'COMPLETED' AND sale_date >= CURDATE()) AS today_sales,
      (SELECT COUNT(*) FROM sales WHERE sale_status = 'COMPLETED' AND sale_date >= CURDATE()) AS today_transactions,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE sale_status = 'COMPLETED' AND sale_date >= CURDATE() AND created_by = ?) AS my_sales,
      (SELECT COUNT(*) FROM sales WHERE sale_status = 'COMPLETED' AND sale_date >= CURDATE() AND created_by = ?) AS my_transactions,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE sale_status = 'COMPLETED' AND sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS month_sales,
      (SELECT COALESCE(SUM(total_amount), 0) FROM purchases WHERE status = 'RECEIVED' AND purchase_date = CURDATE()) AS today_purchases,
      (SELECT COUNT(*) FROM purchases WHERE status = 'PENDING') AS pending_purchases,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'ACTIVE' AND expense_date = CURDATE()) AS today_expenses,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'ACTIVE' AND expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS month_expenses,
      (SELECT COALESCE(SUM(stock_quantity * cost_price), 0) FROM products WHERE status = 'ACTIVE') AS inventory_value`,
    [req.user.id, req.user.id],
  )
  return success(res, {
    todaysSales: Number(row.today_sales),
    todayTransactions: Number(row.today_transactions),
    mySalesToday: Number(row.my_sales),
    myTransactionsToday: Number(row.my_transactions),
    monthSales: Number(row.month_sales),
    todaysPurchases: Number(row.today_purchases),
    pendingPurchases: Number(row.pending_purchases),
    todaysExpenses: Number(row.today_expenses),
    monthExpenses: Number(row.month_expenses),
    totalProducts: Number(row.total_products),
    lowStockItems: Number(row.low_stock),
    outOfStockItems: Number(row.out_of_stock),
    totalEmployees: Number(row.employees),
    inventoryValue: Number(row.inventory_value),
  })
}
