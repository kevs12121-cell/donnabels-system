import { useState } from 'react'
import { compactMoney, formatDate, money, quantity, weekday } from '../utils/format'

function niceCeiling(value) {
  if (value <= 0) return 1000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value)
  return step * magnitude
}

/**
 * Seven-day sales columns. Single series: no legend (the card title names it).
 * Today is drawn in the accent; earlier days in a lighter step of the same hue.
 * Labels only on today and the peak day; every value is in the tooltip and the
 * screen-reader table.
 */
export function SalesTrendChart({ data = [] }) {
  const [active, setActive] = useState(null)
  const max = niceCeiling(Math.max(...data.map((day) => day.total), 0))
  const peakIndex = data.reduce((best, day, index) => (day.total > (data[best]?.total ?? -1) ? index : best), 0)
  const lastIndex = data.length - 1
  const ticks = [max, max / 2, 0]

  return (
    <div className="trend-chart">
      <div className="trend-plot" onMouseLeave={() => setActive(null)}>
        <div className="trend-grid" aria-hidden="true">
          {ticks.map((tick) => <div key={tick} className="trend-gridline"><span>{compactMoney(tick)}</span></div>)}
        </div>
        <div className="trend-columns">
          {data.map((day, index) => {
            const height = max ? (day.total / max) * 100 : 0
            const isToday = index === lastIndex
            const showLabel = (isToday || index === peakIndex) && day.total > 0
            return (
              <button
                key={day.sale_date}
                type="button"
                className={`trend-slot ${active === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${formatDate(day.sale_date)}: ${money(day.total)} from ${day.transactions} sales`}
              >
                <span className="trend-bar-area">
                  {showLabel && <span className="trend-value" style={{ bottom: `calc(${height}% + 6px)` }}>{compactMoney(day.total)}</span>}
                  <span className={`trend-bar ${isToday ? 'is-today' : ''}`} style={{ height: `${Math.max(height, day.total > 0 ? 1.5 : 0)}%` }} />
                </span>
                <span className={`trend-label ${isToday ? 'is-today' : ''}`}>{isToday ? 'Today' : weekday(day.sale_date)}</span>
                {active === index && (
                  <span className={`chart-tooltip ${index > lastIndex - 2 ? 'align-right' : index < 2 ? 'align-left' : ''}`} role="tooltip">
                    <strong>{money(day.total)}</strong>
                    <span>{day.transactions} sales · {formatDate(day.sale_date)}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <table className="sr-only">
        <caption>Completed sales for the last seven days</caption>
        <thead><tr><th>Date</th><th>Sales</th><th>Transactions</th></tr></thead>
        <tbody>{data.map((day) => <tr key={day.sale_date}><td>{formatDate(day.sale_date)}</td><td>{money(day.total)}</td><td>{day.transactions}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

/** Ranked horizontal bars for one measure across categories (single series, one hue). */
export function BreakdownBars({ rows = [], valueFormat = money, countLabel = 'records', quantityMode = false }) {
  const values = rows.map((row) => Math.abs(Number(row.total)))
  const max = Math.max(...values, 0)
  const sum = values.reduce((total, value) => total + value, 0)
  if (!rows.length) return <p className="muted-text">No data for this period.</p>
  return (
    <ul className="breakdown">
      {rows.map((row) => {
        const value = Math.abs(Number(row.total))
        const share = sum ? (value / sum) * 100 : 0
        return (
          <li key={row.label} title={`${row.label}: ${quantityMode ? quantity(row.total) : valueFormat(row.total)} (${share.toFixed(1)}%)`}>
            <div className="breakdown-text">
              <span className="breakdown-label">{String(row.label).replaceAll('_', ' ')}</span>
              <span className="breakdown-value">{quantityMode ? quantity(row.total) : valueFormat(row.total)}</span>
            </div>
            <div className="breakdown-track" aria-hidden="true"><span style={{ width: `${max ? Math.max((value / max) * 100, 1) : 0}%` }} /></div>
            <span className="breakdown-meta">{Number(row.count).toLocaleString()} {countLabel} · {share.toFixed(1)}%</span>
          </li>
        )
      })}
    </ul>
  )
}
