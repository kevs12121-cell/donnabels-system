import { env } from './config/env.js'
import app from './app.js'
import { pool, waitForDatabase } from './config/db.js'
import { migrate } from './db/migrate.js'
import { seedIfEmpty } from './db/seed.js'
import { startDemoSimulator } from './db/simulator.js'

async function prepareDatabase() {
  await waitForDatabase()
  if (env.autoMigrate) {
    await migrate()
    console.log('[db] Schema is up to date')
    if (await seedIfEmpty()) console.log('[db] Empty database seeded with starter data')
  }
  startDemoSimulator()
}

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`Donz Flower Shop listening on port ${env.port}`)
})

prepareDatabase().catch((error) => {
  // Keep the HTTP server up so /api/health reports the problem instead of crash-looping.
  console.error('[db] Database preparation failed:', error)
})

function shutdown(signal) {
  console.log(`${signal} received, shutting down`)
  server.close(() => pool.end().finally(() => process.exit(0)))
  setTimeout(() => process.exit(0), 8000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
