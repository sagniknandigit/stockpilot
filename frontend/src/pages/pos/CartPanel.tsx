import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatMoney, pluralize } from '@/lib/format'
import { spring } from '@/lib/motion'
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
          <ShoppingCart className="size-4 text-accent" aria-hidden="true" /> Current sale
          {cart.itemCount > 0 && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-soft-foreground">
              {pluralize(cart.itemCount, 'item')}
            </span>
          )}
        </h2>
        {cart.lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={cart.clear} disabled={disabled}>
            Clear
          </Button>
        )}
      </div>

      {cart.lines.length === 0 ? (
        <EmptyState
          className="flex-1 justify-center"
          icon={ShoppingCart}
          compact
          title="Cart is empty"
          description="Scan a barcode or tap a product to add it."
        />
      ) : (
        <ul className="flex-1 overflow-x-hidden overflow-y-auto" aria-label="Cart items">
          <AnimatePresence initial={false}>
            {cart.lines.map((line) => {
              const short = line.shortage || line.quantity > line.available
              return (
                <motion.li
                  key={line.variantId}
                  layout
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
                  transition={spring}
                  className={cn('border-b px-4 py-3', short && 'bg-danger/5')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {line.productName}
                        {line.variantName !== 'Default' && (
                          <span className="font-normal text-muted"> · {line.variantName}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {formatMoney(line.unitPrice, currency)} each
                      </p>
                    </div>
                    <motion.p
                      key={line.quantity}
                      initial={{ scale: 1.08 }}
                      animate={{ scale: 1 }}
                      className="font-semibold text-foreground"
                    >
                      {formatMoney((toCents(line.unitPrice) * line.quantity) / 100, currency)}
                    </motion.p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div
                      className="flex items-center rounded-xl border bg-surface"
                      role="group"
                      aria-label={`Quantity of ${line.sku}`}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-r-none"
                        onClick={() => cart.setQuantity(line.variantId, line.quantity - 1)}
                        disabled={disabled || line.quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        <Minus />
                      </Button>
                      <span className="w-10 text-center text-sm font-semibold" aria-live="polite">
                        {line.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-l-none"
                        onClick={() => cart.setQuantity(line.variantId, line.quantity + 1)}
                        disabled={disabled || line.quantity >= line.available}
                        aria-label="Increase quantity"
                      >
                        <Plus />
                      </Button>
                    </div>
                    {short ? (
                      <p className="text-xs font-medium text-danger-ink" role="alert">
                        Only {line.available} available
                      </p>
                    ) : line.quantity >= line.available ? (
                      <p className="text-xs text-muted">Max available</p>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted hover:text-danger-ink"
                      onClick={() => cart.remove(line.variantId)}
                      disabled={disabled}
                      aria-label={`Remove ${line.productName}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
      <div className="border-t bg-subtle/40">{footer}</div>
    </div>
  )
}
