export async function withTransaction(pool, callback) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export function apiError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}
