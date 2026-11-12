import { Router } from 'express'
import { login, logout, me } from '../controllers/authController.js'
import { authenticateToken } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { changePassword } from '../controllers/adminController.js'

const router = Router()
router.post('/login', asyncHandler(login))
router.get('/me', authenticateToken, asyncHandler(me))
router.post('/logout', authenticateToken, asyncHandler(logout))
router.post('/change-password', authenticateToken, asyncHandler(changePassword))
export default router
