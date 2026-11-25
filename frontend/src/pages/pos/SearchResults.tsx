import { PackageSearch, Plus } from 'lucide-react'
import type { VariantSearchResult } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

interface SearchResultsProps {
  results: VariantSearchResult[] | undefined
  isLoading: boolean
  query: string
  currency: string
  quantityInCart: (variantId: string) => number
  onAdd: (item: VariantSearchResult) => void
}

export function SearchResults({
  results,
  isLoading,
  query,
  currency,
  quantityInCart,
  onAdd,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <ul className="divide-y" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </li>
        ))}
      </ul>
    )
  }

  if (!results || results.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title={query ? `No products match “${query}”` : 'No products to sell yet'}
        description={
          query
            ? 'Check the spelling, or scan the barcode again.'
            : 'Add products and stock them at this location.'
        }
      />
    )
  }

  return (
    <ul className="divide-y" aria-label="Search results">
      {results.map((item) => {
        const inCart = quantityInCart(item.id)
        const remaining = item.available - inCart
        const disabled = remaining <= 0
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onAdd(item)}
              disabled={disabled}
              className={cn(
                'group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors focus-visible:-outline-offset-2',
                disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-subtle/70',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {item.product_name}
                  {item.name !== 'Default' && (
                    <span className="font-normal text-muted"> · {item.name}</span>
                  )}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted">
                  {item.sku}
                  {item.barcode && ` · ${item.barcode}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-semibold text-foreground tabular-nums">
                  {formatMoney(item.price, currency)}
                </span>
                {item.available <= 0 ? (
                  <Badge tone="danger">Out of stock</Badge>
                ) : (
                  <Badge tone={remaining <= 0 ? 'warning' : 'neutral'}>
                    {item.available} available{inCart > 0 && ` · ${inCart} in cart`}
                  </Badge>
                )}
              </div>
              <span
                className="hidden size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent opacity-0 transition-opacity group-hover:opacity-100 sm:grid dark:text-indigo-300"
                aria-hidden="true"
              >
                <Plus className="size-4" />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
