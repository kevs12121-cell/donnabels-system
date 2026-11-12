import { apiError } from './transaction.js'

export function required(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw apiError(`${field} is required`)
  }
}

export function positiveNumber(value, field) {
  if (value !== undefined && value !== null && value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0)) {
    throw apiError(`${field} must be a non-negative number`)
  }
}

export function isoDate(value, field) {
  if (value === undefined || value === null || value === '') return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(value))) {
    throw apiError(`${field} must be a valid date (YYYY-MM-DD)`)
  }
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw apiError(`Invalid ${field}`)
}
