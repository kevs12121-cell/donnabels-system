export function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` })
}

const mysqlErrors = {
  ER_DUP_ENTRY: [409, 'A record with the same code, name, or email already exists'],
  ER_NO_REFERENCED_ROW_2: [400, 'A referenced record does not exist'],
  ER_ROW_IS_REFERENCED_2: [409, 'This record is still in use and cannot be removed'],
  ER_TRUNCATED_WRONG_VALUE: [400, 'One of the values has an invalid format'],
  ER_WRONG_VALUE_FOR_TYPE: [400, 'One of the values has an invalid format'],
  ER_DATA_TOO_LONG: [400, 'One of the values is too long'],
  ER_WARN_DATA_OUT_OF_RANGE: [400, 'One of the numbers is out of range'],
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  const mapped = mysqlErrors[error.code]
  const status = mapped?.[0] || error.statusCode || error.status || 500
  if (status >= 500) console.error(error)
  res.status(status).json({
    success: false,
    message: mapped?.[1] || (status >= 500 ? 'Something went wrong. Please try again.' : error.message),
  })
}
