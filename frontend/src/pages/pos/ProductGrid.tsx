import { PackageSearch } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { VariantSearchResult } from '@/api/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoney } from '@/lib/format'
import { spring } from '@/lib/motion'
import { cn, initials } from '@/lib/utils'

interface ProductGridProps {
  items: VariantSearchResult[] | undefined
  isLoading: boolean
  query: string
  currency: string
  quantityInCart: (variantId: string) => number
  onAdd: (item: VariantSearchResult) => void
}

/** Large touch-friendly tiles: tap to add one unit. */
export function ProductGrid({
  items,
  isLoading,
  query,
  currency,
  quantityInCart,
  onAdd,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border bg-surface">
        <EmptyState
          title={query ? `No products match “${query}”` : 'No products here yet'}
          description={
            query
              ? 'Check the spelling, or scan the barcode again.'
              : 'Add products and stock them at this location.'
          }
          icon={PackageSearch}
        />
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Products">
      {items.map((item) => {
        const inCart = quantityInCart(item.id)
        const remaining = item.available - inCart
        const disabled = remaining <= 0
        const label =
          item.name === 'Default' ? item.product_name : `${item.product_name} · ${item.name}`
        return (
          <li key={item.id}>
            <motion.button
              type="button"
              onClick={() => onAdd(item)}
              disabled={disabled}
              whileTap={disabled ? undefined : { scale: 0.96 }}
              transition={spring}
              aria-label={`Add ${label}, ${formatMoney(item.price, currency)}, ${item.available} available`}
              className={cn(
                'group relative flex h-full min-h-36 w-full flex-col rounded-2xl border bg-surface p-3.5 text-left shadow-card transition-[box-shadow,border-color]',
                disabled
                  ? 'cursor-not-allowed opacity-55'
                  : 'hover:border-accent/40 hover:shadow-pop',
                inCart > 0 && 'border-accent/50 ring-2 ring-accent/15',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-sm font-semibold text-accent-soft-foreground transition-transform group-hover:scale-105">
                  {initials(item.product_name)}
                </span>
                <AnimatePresence>
                  {inCart > 0 && (
                    <motion.span
                      key={inCart}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={spring}
                      className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-gradient px-1.5 text-xs font-semibold text-white shadow-glow"
                    >
                      {inCart}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
                {item.product_name}
                {item.name !== 'Default' && <span className="text-muted"> · {item.name}</span>}
              </p>
              <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                <span className="text-base font-semibold text-foreground">
                  {formatMoney(item.price, currency)}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    item.available <= 0
                      ? 'text-danger-ink'
                      : remaining <= 2
                        ? 'text-warning-ink'
                        : 'text-muted',
                  )}
                >
                  {item.available <= 0 ? 'Out of stock' : `${remaining} left`}
                </span>
              </div>
            </motion.button>
          </li>
        )
      })}
    </ul>
  )
}
