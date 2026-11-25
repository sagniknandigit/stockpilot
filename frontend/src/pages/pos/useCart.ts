import { useMemo, useReducer } from 'react'
import type { StockShortage, UUID, VariantSearchResult } from '@/api/types'
import { toCents } from '@/lib/money'

export interface CartLine {
  variantId: UUID
  productName: string
  variantName: string
  sku: string
  /** Unit price as the API decimal string. */
  unitPrice: string
  quantity: number
  /** Sellable quantity at this location when last checked. */
  available: number
  /** Set when checkout reported this line short; cleared when the line is edited. */
  shortage: boolean
}

type Action =
  | { type: 'add'; item: VariantSearchResult }
  | { type: 'setQuantity'; variantId: UUID; quantity: number }
  | { type: 'remove'; variantId: UUID }
  | { type: 'applyShortages'; shortages: StockShortage[] }
  | { type: 'clear' }

function reducer(lines: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case 'add': {
      const { item } = action
      const existing = lines.find((line) => line.variantId === item.id)
      if (existing) {
        return lines.map((line) =>
          line.variantId === item.id
            ? {
                ...line,
                available: item.available,
                quantity: Math.min(line.quantity + 1, item.available),
                shortage: false,
              }
            : line,
        )
      }
      return [
        ...lines,
        {
          variantId: item.id,
          productName: item.product_name,
          variantName: item.name,
          sku: item.sku,
          unitPrice: item.price,
          quantity: 1,
          available: item.available,
          shortage: false,
        },
      ]
    }
    case 'setQuantity':
      return lines.map((line) =>
        line.variantId === action.variantId
          ? {
              ...line,
              quantity: Math.max(1, Math.min(action.quantity, line.available)),
              shortage: false,
            }
          : line,
      )
    case 'remove':
      return lines.filter((line) => line.variantId !== action.variantId)
    case 'applyShortages': {
      const available = new Map(action.shortages.map((s) => [s.variant_id, s.available]))
      return lines.map((line) =>
        available.has(line.variantId)
          ? { ...line, available: available.get(line.variantId)!, shortage: true }
          : line,
      )
    }
    case 'clear':
      return []
  }
}

export type AddResult = 'added' | 'out_of_stock' | 'at_limit'

/**
 * Cart state with derived totals (integer cents — no floating point money math).
 * `onChange` fires after every user edit (not after server-driven availability updates).
 */
export function useCart({ onChange }: { onChange?: () => void } = {}) {
  const [lines, dispatch] = useReducer(reducer, [])

  const subtotalCents = useMemo(
    () => lines.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0),
    [lines],
  )
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const hasProblems = lines.some((line) => line.shortage || line.quantity > line.available)

  return {
    lines,
    subtotalCents,
    itemCount,
    hasProblems,
    /** Adds one unit, refusing to exceed what is available at this location. */
    add(item: VariantSearchResult): AddResult {
      const inCart = lines.find((line) => line.variantId === item.id)?.quantity ?? 0
      if (item.available <= 0) return 'out_of_stock'
      if (inCart >= item.available) return 'at_limit'
      dispatch({ type: 'add', item })
      onChange?.()
      return 'added'
    },
    setQuantity(variantId: UUID, quantity: number) {
      dispatch({ type: 'setQuantity', variantId, quantity })
      onChange?.()
    },
    remove(variantId: UUID) {
      dispatch({ type: 'remove', variantId })
      onChange?.()
    },
    clear() {
      dispatch({ type: 'clear' })
      onChange?.()
    },
    applyShortages: (shortages: StockShortage[]) => dispatch({ type: 'applyShortages', shortages }),
  }
}

export type Cart = ReturnType<typeof useCart>
