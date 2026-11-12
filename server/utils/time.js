const pad = (value) => String(value).padStart(2, '0')

/** YYYY-MM-DD in the shop's local timezone. */
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** YYYY-MM-DD HH:MM:SS in the shop's local timezone (MySQL DATETIME format). */
export function localDateTime(date = new Date()) {
  return `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Current UTC offset formatted for MySQL `SET time_zone`, e.g. +08:00. */
export function mysqlOffset(date = new Date()) {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

export function compactStamp(date = new Date()) {
  return `${localDate(date).replaceAll('-', '')}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}
