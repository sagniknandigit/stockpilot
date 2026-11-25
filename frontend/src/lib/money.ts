/**
 * Money arrives from the API as decimal strings ("12.50"). To avoid floating point drift,
 * any arithmetic the UI does (cart previews) happens in integer minor units (cents).
 */

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/

/** True if the string is a non-negative amount with at most two decimals. */
export function isValidAmount(value: string): boolean {
  return MONEY_PATTERN.test(value.trim()) && !value.trim().startsWith('-')
}

/** "12.5" -> 1250. Throws on malformed input. */
export function toCents(value: string): number {
  const trimmed = value.trim()
  if (!MONEY_PATTERN.test(trimmed)) throw new Error(`Invalid amount: ${value}`)
  const negative = trimmed.startsWith('-')
  const [whole, fraction = ''] = trimmed.replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -cents : cents
}

/** 1250 -> "12.50" (the wire format the API expects). */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
