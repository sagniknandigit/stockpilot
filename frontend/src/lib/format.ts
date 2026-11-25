const formatterCache = new Map<string, Intl.NumberFormat>()

function currencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = formatterCache.get(currency)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency })
    } catch {
      // Unknown ISO code: fall back to a plain two-decimal number.
      formatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2 })
    }
    formatterCache.set(currency, formatter)
  }
  return formatter
}

/** Format an API money string ("12.50") or a number for display. */
export function formatMoney(value: string | number, currency: string): string {
  const amount = typeof value === 'number' ? value : Number(value)
  return currencyFormatter(currency).format(Number.isFinite(amount) ? amount : 0)
}

/** Compact currency for chart axes: ₹12K. */
export function formatMoneyCompact(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  } catch {
    return formatNumber(value)
  }
}

const numberFormatter = new Intl.NumberFormat()

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** Cached formatter per (style, time zone). Falls back to the browser zone if `timeZone` is invalid. */
function dateFormatter(style: 'date' | 'datetime', timeZone?: string): Intl.DateTimeFormat {
  const key = `${style}|${timeZone ?? ''}`
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions =
      style === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }
    try {
      formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone })
    } catch {
      formatter = new Intl.DateTimeFormat(undefined, options)
    }
    dateFormatters.set(key, formatter)
  }
  return formatter
}

/** Format an ISO instant in the organization's time zone (pass `organization.timezone`). */
export function formatDateTime(iso: string, timeZone?: string): string {
  return dateFormatter('datetime', timeZone).format(new Date(iso))
}

export function formatDate(iso: string, timeZone?: string): string {
  return dateFormatter('date', timeZone).format(new Date(iso))
}

/** Milliseconds `timeZone` is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return wall - (instant - (instant % 1000))
}

/**
 * The UTC instant of a wall-clock time ("YYYY-MM-DD" + time of day) in an IANA time zone,
 * e.g. the start of "2026-11-25" in Asia/Kolkata. Used for date-range filters.
 */
export function zonedDateToIso(day: string, edge: 'start' | 'end', timeZone?: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const wall = edge === 'start' ? Date.UTC(y, m - 1, d) : Date.UTC(y, m - 1, d, 23, 59, 59, 999)
  if (!timeZone) {
    // No zone: interpret in the browser's local time.
    const local = edge === 'start' ? new Date(y, m - 1, d) : new Date(y, m - 1, d, 23, 59, 59, 999)
    return local.toISOString()
  }
  try {
    // Two passes handle a DST change between the guess and the answer.
    let instant = wall - zoneOffsetMs(wall, timeZone)
    instant = wall - zoneOffsetMs(instant, timeZone)
    return new Date(instant).toISOString()
  } catch {
    return zonedDateToIso(day, edge)
  }
}

/** Format a calendar date ("2026-11-25", no time zone) as a short weekday label: "Wed 25". */
export function formatDayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' }).format(
    new Date(year, month - 1, date),
  )
}

export function formatOrderNumber(number: number): string {
  return `SO-${number}`
}

/** "1 order", "3 orders". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}
