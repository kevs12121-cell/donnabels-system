import { Router } from 'express'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { salesReport, inventoryReport, inventoryMovementsReport, purchasesReport, expensesReport, profitSummary } from '../controllers/reportsController.js'

const router = Router()
router.use(authenticateToken, authorizeRoles('OWNER'))
router.get('/sales', asyncHandler(salesReport))
router.get('/inventory', asyncHandler(inventoryReport))
router.get('/inventory-movements', asyncHandler(inventoryMovementsReport))
router.get('/purchases', asyncHandler(purchasesReport))
router.get('/expenses', asyncHandler(expensesReport))
router.get('/profit-summary', asyncHandler(profitSummary))
export default router
