import type { Product } from '@/api/types'
import { formatMoney } from '@/lib/format'
import { toCents } from '@/lib/money'

/** "₹199.00" or "₹199.00 – ₹249.00" across a product's active variants. */
export function priceRange(product: Product, currency: string): string {
  const prices = product.variants.filter((v) => v.is_active).map((v) => toCents(v.price))
  if (prices.length === 0) return '—'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const format = (cents: number) => formatMoney(cents / 100, currency)
  return min === max ? format(min) : `${format(min)} – ${format(max)}`
}
