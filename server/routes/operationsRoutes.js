import { Router } from 'express'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { listInventory, getInventory, lowStock, adjustStock } from '../controllers/inventoryController.js'
import { listPurchases, getPurchase, createPurchase, receivePurchase, cancelPurchase } from '../controllers/purchaseController.js'
import { listSales, getSale, createSale, voidSale } from '../controllers/salesController.js'
import { listExpenses, createExpense, updateExpense, setExpenseStatus } from '../controllers/expenseController.js'

const router = Router()
router.use(authenticateToken)

router.get('/inventory', asyncHandler(listInventory))
router.get('/inventory/low-stock', asyncHandler(lowStock))
router.get('/inventory/:productId', asyncHandler(getInventory))
router.post('/inventory/adjust', authorizeRoles('OWNER', 'EMPLOYEE'), asyncHandler(adjustStock))

router.get('/purchases', asyncHandler(listPurchases))
router.get('/purchases/:id', asyncHandler(getPurchase))
router.post('/purchases', authorizeRoles('OWNER', 'EMPLOYEE'), asyncHandler(createPurchase))
router.post('/purchases/:id/receive', authorizeRoles('OWNER', 'EMPLOYEE'), asyncHandler(receivePurchase))
router.post('/purchases/:id/cancel', authorizeRoles('OWNER'), asyncHandler(cancelPurchase))

router.get('/sales', asyncHandler(listSales))
router.get('/sales/:id', asyncHandler(getSale))
router.get('/sales/:id/items', asyncHandler(getSale))
router.post('/sales', authorizeRoles('OWNER', 'EMPLOYEE'), asyncHandler(createSale))
router.post('/sales/:id/void', authorizeRoles('OWNER'), asyncHandler(voidSale))

router.get('/expenses', asyncHandler(listExpenses))
router.post('/expenses', authorizeRoles('OWNER', 'EMPLOYEE'), asyncHandler(createExpense))
router.put('/expenses/:id', authorizeRoles('OWNER'), asyncHandler(updateExpense))
router.patch('/expenses/:id/status', authorizeRoles('OWNER'), asyncHandler(setExpenseStatus))

export default router
