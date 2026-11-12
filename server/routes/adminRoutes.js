import { Router } from 'express'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { listUsers, createUser, updateUser, setUserStatus, settings, updateSettings, activityLogs } from '../controllers/adminController.js'

const router = Router()
router.use(authenticateToken)
router.get('/users', authorizeRoles('OWNER'), asyncHandler(listUsers))
router.post('/users', authorizeRoles('OWNER'), asyncHandler(createUser))
router.put('/users/:id', authorizeRoles('OWNER'), asyncHandler(updateUser))
router.patch('/users/:id/status', authorizeRoles('OWNER'), asyncHandler(setUserStatus))
router.get('/settings', asyncHandler(settings))
router.put('/settings', authorizeRoles('OWNER'), asyncHandler(updateSettings))
router.get('/activity-logs', authorizeRoles('OWNER'), asyncHandler(activityLogs))
export default router
