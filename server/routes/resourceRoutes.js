import { Router } from 'express'
import { create, getOne, list, setStatus, update } from '../controllers/crudController.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'

/**
 * Master-data routes. Everyone signed in can read (except where ownerOnlyRead is set);
 * only the owner can create, edit, or change the status of master data.
 */
export function resourceRoutes(resource, options = {}) {
  const router = Router()
  const ownerOnly = authorizeRoles('OWNER')
  const withResource = (handler) => asyncHandler((req, res) => {
    req.resource = resource
    return handler(req, res)
  })
  router.use(authenticateToken)
  if (options.ownerOnlyRead) router.use(ownerOnly)
  router.get('/', withResource(list))
  router.get('/:id', withResource(getOne))
  router.post('/', ownerOnly, withResource(create))
  router.put('/:id', ownerOnly, withResource(update))
  router.patch('/:id/status', ownerOnly, withResource(setStatus))
  return router
}
