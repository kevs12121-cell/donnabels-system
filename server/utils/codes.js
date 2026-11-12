import { compactStamp } from './time.js'

export function transactionCode(prefix, date = new Date()) {
  const suffix = Math.floor(Math.random() * 900 + 100)
  return `${prefix}-${compactStamp(date)}-${suffix}`
}
