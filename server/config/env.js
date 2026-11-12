import 'dotenv/config'

// The shop operates in the Philippines. All business dates ("today", report ranges,
// receipt timestamps) follow this timezone regardless of where the server runs.
process.env.TZ ||= 'Asia/Manila'

function databaseConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL
  if (url) {
    const parsed = new URL(url)
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'donnasFlowerShop',
    }
  }
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'donnasFlowerShop',
  }
}

const isProduction = process.env.NODE_ENV === 'production'

export const env = {
  isProduction,
  port: Number(process.env.PORT || 5004),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5177')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'change_this_development_secret',
  // Create tables automatically on boot (safe: every statement is IF NOT EXISTS).
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  // Populate an empty database with sample shop data on first boot.
  seedDemoData: process.env.SEED_DEMO_DATA !== 'false',
  // Keep generating realistic shop activity over time (for demo deployments only).
  demoMode: process.env.DEMO_MODE === 'true',
  defaultPasswords: {
    owner: process.env.OWNER_PASSWORD || 'password',
    cashier: process.env.CASHIER_PASSWORD || 'password',
  },
  db: databaseConfig(),
}

if (isProduction && env.jwtSecret === 'change_this_development_secret') {
  console.warn('[security] JWT_SECRET is not set. Set a long random JWT_SECRET in production.')
}
