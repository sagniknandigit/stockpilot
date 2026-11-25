import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatMoney } from '@/lib/format'
import { toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Cart } from './useCart'

interface CartPanelProps {
  cart: Cart
  currency: string
  disabled: boolean
  /** Totals, discount and checkout controls rendered under the lines. */
  footer: ReactNode
}

export function CartPanel({ cart, currency, disabled, footer }: CartPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <ShoppingCart className="size-4" aria-hidden="true" /> Current sale
        </h2>
        {cart.lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={cart.clear} disabled={disabled}>
            Clear
          </Button>
        )}
      </div>

      {cart.lines.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={ShoppingCart}
          title="Cart is empty"
          description="Scan a barcode or search for a product to add it."
        />
      ) : (
        <ul className="flex-1 divide-y overflow-y-auto" aria-label="Cart items">
          {cart.lines.map((line) => {
            const short = line.shortage || line.quantity > line.available
            return (
              <li key={line.variantId} className={cn('px-4 py-3', short && 'bg-red-500/5')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {line.productName}
                      {line.variantName !== 'Default' && (
                        <span className="font-normal text-muted"> · {line.variantName}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {formatMoney(line.unitPrice, currency)} each
                    </p>
                  </div>
                  <p className="font-semibold text-foreground tabular-nums">
                    {formatMoney((toCents(line.unitPrice) * line.quantity) / 100, currency)}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div
                    className="flex items-center rounded-lg border"
                    role="group"
                    aria-label={`Quantity of ${line.sku}`}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-r-none"
                      onClick={() => cart.setQuantity(line.variantId, line.quantity - 1)}
                      disabled={disabled || line.quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus />
                    </Button>
                    <span
                      className="w-10 text-center text-sm font-medium tabular-nums"
                      aria-live="polite"
                    >
                      {line.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-l-none"
                      onClick={() => cart.setQuantity(line.variantId, line.quantity + 1)}
                      disabled={disabled || line.quantity >= line.available}
                      aria-label="Increase quantity"
                    >
                      <Plus />
                    </Button>
                  </div>
                  {short ? (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                      Only {line.available} available
                    </p>
                  ) : line.quantity >= line.available ? (
                    <p className="text-xs text-muted">Max available</p>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted hover:text-red-600"
                    onClick={() => cart.remove(line.variantId)}
                    disabled={disabled}
                    aria-label={`Remove ${line.productName}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="border-t">{footer}</div>
    </div>
  )
}
