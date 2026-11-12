import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { checkDatabase } from './config/db.js'
import authRoutes from './routes/authRoutes.js'
import { resourceRoutes } from './routes/resourceRoutes.js'
import { summary } from './controllers/dashboardController.js'
import { authenticateToken } from './middleware/auth.js'
import { asyncHandler } from './utils/asyncHandler.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { success } from './utils/response.js'
import operationsRoutes from './routes/operationsRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import { dashboardDetails } from './controllers/reportsController.js'

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(cors({ origin: env.clientOrigins }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => success(res, { message: 'Donz Flower Shop API is running', demo: env.demoMode }))
app.get('/api/health/database', asyncHandler(async (req, res) => success(res, { connected: await checkDatabase() })))
app.use('/api/auth', authRoutes)
app.get('/api/dashboard/summary', authenticateToken, asyncHandler(summary))
app.get('/api/dashboard/details', authenticateToken, asyncHandler(dashboardDetails))
app.use('/api/products', resourceRoutes('products'))
app.use('/api/categories', resourceRoutes('categories'))
app.use('/api/suppliers', resourceRoutes('suppliers'))
app.use('/api/employees', resourceRoutes('employees', { ownerOnlyRead: true }))
app.use('/api/reports', reportRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api', operationsRoutes)
app.use('/api', notFound)

// Serve the built React app (npm run build) from the same origin as the API.
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const indexFile = fileURLToPath(new URL('../dist/index.html', import.meta.url))
if (existsSync(indexFile)) {
  app.use('/assets', express.static(`${distDir}/assets`, { immutable: true, maxAge: '1y' }))
  app.use(express.static(distDir, { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    res.set('Cache-Control', 'no-cache')
    return res.sendFile(indexFile)
  })
}

app.use(notFound)
app.use(errorHandler)
export default app
