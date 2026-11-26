import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useId, useState } from 'react'
import { catalogApi } from '@/api/catalog'
import type { UUID, VariantSearchResult } from '@/api/types'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { queryKeys } from '@/hooks/queryKeys'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/utils'

interface VariantPickerProps {
  locationId: UUID
  excludeIds: Set<UUID>
  onPick: (variant: VariantSearchResult) => void
}

/** Search-as-you-type combobox over the catalog (same lookup as the POS). */
export function VariantPicker({ locationId, excludeIds, onPick }: VariantPickerProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const term = useDebouncedValue(query.trim(), 150)
  const search = useQuery({
    queryKey: queryKeys.catalog.variantSearch(locationId, term),
    queryFn: ({ signal }) => catalogApi.searchVariants(locationId, term, signal),
    enabled: open,
  })
  const results = (search.data ?? []).filter((v) => !excludeIds.has(v.id)).slice(0, 8)
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0))

  function pick(variant: VariantSearchResult | undefined) {
    if (!variant) return
    onPick(variant)
    setQuery('')
    setActive(0)
  }

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setActive((activeIndex + delta + results.length) % Math.max(results.length, 1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(results[activeIndex])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder="Add a product — search by name, SKU or barcode…"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && results.length ? `${listId}-${activeIndex}` : undefined}
        aria-label="Add product to purchase order"
        className="h-10 pl-9"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border bg-surface-raised p-1 shadow-pop"
        >
          {search.isPending ? (
            <li className="flex items-center gap-2 px-3 py-3 text-[13px] text-muted">
              <Spinner className="size-4" /> Searching…
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-3 text-[13px] text-muted">No matching products</li>
          ) : (
            results.map((variant, index) => (
              <li
                key={variant.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(variant)}
                onMouseMove={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px]',
                  index === activeIndex && 'bg-accent-soft',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {variant.product_name}
                    {variant.name !== 'Default' && (
                      <span className="font-normal text-muted"> · {variant.name}</span>
                    )}
                  </span>
                  <span className="block font-mono text-xs text-muted">{variant.sku}</span>
                </span>
                <span className="text-xs text-muted">{variant.available} in stock</span>
                <Plus className="size-4 text-accent" aria-hidden="true" />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
