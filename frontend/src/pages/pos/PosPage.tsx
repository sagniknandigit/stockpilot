import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, MapPin, ScanBarcode, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { catalogApi } from '@/api/catalog'
import type { Location, Order, StockShortage, VariantSearchResult } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Kbd } from '@/components/ui/Kbd'
import { PageLoader } from '@/components/ui/PageLoader'
import { toast } from '@/components/ui/toast'
import { queryKeys } from '@/hooks/queryKeys'
import { useCategories, useProducts } from '@/hooks/useCatalog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useCreateOrder } from '@/hooks/useSales'
import { getErrorMessage, isApiError } from '@/lib/errors'
import { formatMoney, formatOrderNumber, pluralize } from '@/lib/format'
import { fromCents, isValidAmount, toCents } from '@/lib/money'
import { cn, createIdempotencyKey } from '@/lib/utils'
import { useCurrentLocation } from '@/providers/LocationContext'
import { CameraScanDialog } from './CameraScanDialog'
import { CartPanel } from './CartPanel'
import { ReceiptDialog } from './ReceiptDialog'
import { ProductGrid } from './ProductGrid'
import { useCart } from './useCart'

export function PosPage() {
  const { location, isLoading } = useCurrentLocation()
  const canManage = useCan('manager')

  if (isLoading) return <PageLoader />
  if (!location) {
    return (
      <EmptyState
        icon={MapPin}
        title="No location to sell from"
        description="Point of sale needs a store location with stock."
        action={
          canManage && (
            <Link to="/inventory?tab=locations" className="font-medium text-accent hover:underline">
              Add a location
            </Link>
          )
        }
      />
    )
  }
  // Remount per location: the cart and availability only make sense for one store.
  return <PosTerminal key={location.id} location={location} />
}

function isExactMatch(
  item: VariantSearchResult | undefined,
  term: string,
): item is VariantSearchResult {
  return !!item && (item.barcode === term || item.sku.toLowerCase() === term.toLowerCase())
}

function PosTerminal({ location }: { location: Location }) {
  const { organization } = useSession()
  const currency = organization.currency
  const canDiscount = useCan('manager')
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [receipt, setReceipt] = useState<Order | null>(null)
  const [discount, setDiscount] = useState('')
  const [customerName, setCustomerName] = useState('')
  /**
   * Generated on the first checkout attempt and reused for retries of the *same* sale, so a
   * retry after a dropped connection can never sell twice. Any cart change discards it.
   */
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  const createOrder = useCreateOrder()
  const cart = useCart({ onChange: onSaleChanged })
  const term = useDebouncedValue(query.trim(), 150)

  const search = useQuery({
    queryKey: queryKeys.catalog.variantSearch(location.id, term),
    queryFn: ({ signal }) => catalogApi.searchVariants(location.id, term, signal),
    placeholderData: keepPreviousData,
  })
  const categories = useCategories()
  // The POS search has no category filter, so chips filter the tiles by the category's
  // product ids (one catalog page covers a small shop; the search box covers the rest).
  const categoryProducts = useProducts({ category_id: categoryId, size: 100 }, Boolean(categoryId))
  const categoryProductIds = categoryId
    ? new Set(categoryProducts.data?.items.map((p) => p.id))
    : null
  const tiles = categoryProductIds
    ? search.data?.filter((item) => categoryProductIds.has(item.product_id))
    : search.data

  /** Every edit to the sale invalidates the pending idempotency key and stale errors. */
  function onSaleChanged() {
    setIdempotencyKey(null)
    createOrder.reset()
  }

  // A barcode scanner "types" fast; make sure keystrokes land in the search box even if
  // focus drifted to a cart button.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return
      if (target.closest('input, textarea, select, dialog, [contenteditable]')) return
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function addItem(item: VariantSearchResult) {
    const result = cart.add(item)
    if (result === 'out_of_stock')
      toast.error(`${item.product_name} is out of stock at ${location.code}`)
    else if (result === 'at_limit')
      toast.error(`Only ${item.available} × ${item.sku} available at ${location.code}`)
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
  }

  /**
   * Scanner/camera path: look up the exact code and add an exact barcode/SKU match directly.
   * The input is cleared immediately so back-to-back scans don't run into each other; the
   * text is restored only if it turned out to be a search rather than a code.
   */
  async function addByCode(code: string) {
    const value = code.trim()
    if (!value) return
    setQuery('')
    const restoreQuery = () => setQuery((current) => current || value)
    try {
      const results = await queryClient.fetchQuery({
        queryKey: queryKeys.catalog.variantSearch(location.id, value),
        queryFn: ({ signal }) => catalogApi.searchVariants(location.id, value, signal),
        staleTime: 0,
      })
      const top = results[0]
      if (isExactMatch(top, value)) {
        addItem(top)
        return
      }
      if (results.length === 0) toast.error(`No product found for “${value}”`)
      restoreQuery()
    } catch (error) {
      toast.error(getErrorMessage(error))
      restoreQuery()
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void addByCode(query)
    } else if (event.key === 'Escape') {
      setQuery('')
    }
  }

  // --- Totals (integer cents) ---
  const discountInput = discount.trim()
  const discountCents =
    canDiscount && discountInput && isValidAmount(discountInput) ? toCents(discountInput) : 0
  const discountError =
    discountInput && !isValidAmount(discountInput)
      ? 'Enter an amount like 5 or 2.50'
      : discountCents > cart.subtotalCents
        ? 'Discount can’t exceed the subtotal'
        : undefined
  const totalCents = cart.subtotalCents - discountCents
  const formatTotal = useCallback((value: number) => formatMoney(value, currency), [currency])

  function checkout() {
    const key = idempotencyKey ?? createIdempotencyKey()
    setIdempotencyKey(key)
    createOrder.mutate(
      {
        idempotencyKey: key,
        input: {
          location_id: location.id,
          lines: cart.lines.map((line) => ({
            variant_id: line.variantId,
            quantity: line.quantity,
          })),
          customer_name: customerName.trim() || null,
          ...(discountCents > 0 && { discount: fromCents(discountCents) }),
        },
      },
      {
        onSuccess: ({ order, replayed }) => {
          setReceipt(order)
          cart.clear() // also discards the idempotency key via onSaleChanged
          setDiscount('')
          setCustomerName('')
          if (replayed)
            toast.info(
              'Sale was already recorded',
              `Showing the original receipt for ${formatOrderNumber(order.number)}.`,
            )
          else toast.success(`Order ${formatOrderNumber(order.number)} completed`)
        },
        onError: (error) => {
          if (isApiError(error, 'insufficient_stock') && Array.isArray(error.details)) {
            cart.applyShortages(error.details as StockShortage[])
            // Refresh the result list so it shows the new availability too.
            void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variantSearches() })
          }
        },
      },
    )
  }

  const checkoutError = createOrder.error
  const pending = createOrder.isPending
  const quantityInCart = (variantId: string) =>
    cart.lines.find((line) => line.variantId === variantId)?.quantity ?? 0
  const canCheckout = cart.lines.length > 0 && !cart.hasProblems && !discountError && !pending
  const totalLabel = formatMoney(fromCents(Math.max(totalCents, 0)), currency)

  // Till shortcuts: F2 focuses the scan box, F9 or Ctrl/⌘+Enter charges the sale.
  const checkoutRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    checkoutRef.current = canCheckout ? checkout : null
  })
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'F2') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (
        event.key === 'F9' ||
        ((event.ctrlKey || event.metaKey) && event.key === 'Enter')
      ) {
        event.preventDefault()
        checkoutRef.current?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label="Find products" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Point of sale</h1>
            <p className="mt-1 text-[13px] text-muted">
              Selling from <span className="font-medium text-foreground">{location.name}</span>
            </p>
          </div>
          <ul
            className="hidden items-center gap-3 text-xs text-muted md:flex"
            aria-label="Keyboard shortcuts"
          >
            <li className="flex items-center gap-1.5">
              <Kbd>F2</Kbd> Search
            </li>
            <li className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd> Clear
            </li>
            <li className="flex items-center gap-1.5">
              <Kbd>F9</Kbd> Charge
            </li>
          </ul>
        </div>

        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-accent"
              aria-hidden="true"
            />
            <Input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Scan a barcode, or search by name or SKU…"
              aria-label="Scan or search products"
              autoComplete="off"
              spellCheck={false}
              className="h-13 rounded-2xl pl-12 text-base shadow-card"
            />
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="h-13 rounded-2xl"
            onClick={() => setScanning(true)}
            aria-label="Scan with camera"
          >
            <Camera /> <span className="hidden sm:inline">Camera</span>
          </Button>
        </div>

        {(categories.data?.length ?? 0) > 0 && (
          <div
            role="radiogroup"
            aria-label="Category"
            className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {[{ id: '', name: 'All' }, ...(categories.data ?? [])].map((category) => {
              const selected = categoryId === category.id
              return (
                <button
                  key={category.id || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategoryId(category.id)}
                  className={cn(
                    'h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                    selected
                      ? 'border-transparent bg-foreground text-background'
                      : 'bg-surface text-muted hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {category.name}
                </button>
              )
            })}
          </div>
        )}

        {search.isError ? (
          <Alert>{getErrorMessage(search.error)}</Alert>
        ) : (
          <ProductGrid
            items={tiles}
            isLoading={search.isPending || (Boolean(categoryId) && categoryProducts.isPending)}
            query={term}
            currency={currency}
            quantityInCart={quantityInCart}
            onAdd={addItem}
          />
        )}
      </section>

      <Card
        id="cart"
        className="flex scroll-mt-20 flex-col overflow-hidden lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]"
      >
        <CartPanel
          cart={cart}
          currency={currency}
          disabled={pending}
          footer={
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer" className={canDiscount ? '' : 'col-span-2'}>
                  {(props) => (
                    <Input
                      {...props}
                      value={customerName}
                      maxLength={120}
                      placeholder="Walk-in"
                      onChange={(event) => {
                        setCustomerName(event.target.value)
                        onSaleChanged()
                      }}
                    />
                  )}
                </Field>
                {canDiscount && (
                  <Field label="Discount" error={discountError}>
                    {(props) => (
                      <Input
                        {...props}
                        value={discount}
                        inputMode="decimal"
                        placeholder="0.00"
                        onChange={(event) => {
                          setDiscount(event.target.value)
                          onSaleChanged()
                        }}
                      />
                    )}
                  </Field>
                )}
              </div>

              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between text-muted">
                  <dt>Subtotal · {pluralize(cart.itemCount, 'item')}</dt>
                  <dd>{formatMoney(fromCents(cart.subtotalCents), currency)}</dd>
                </div>
                {discountCents > 0 && (
                  <div className="flex justify-between text-muted">
                    <dt>Discount</dt>
                    <dd>−{formatMoney(fromCents(discountCents), currency)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-1 text-foreground">
                  <dt className="text-sm font-medium">Total</dt>
                  <dd>
                    <AnimatedNumber
                      value={Math.max(totalCents, 0) / 100}
                      format={formatTotal}
                      duration={0.35}
                      className="text-3xl font-semibold tracking-tight"
                    />
                  </dd>
                </div>
              </dl>

              {checkoutError && <CheckoutError error={checkoutError} />}

              <Button
                size="xl"
                className="w-full"
                onClick={checkout}
                loading={pending}
                disabled={!canCheckout}
              >
                {checkoutError && isApiError(checkoutError) && checkoutError.isNetworkError
                  ? 'Retry checkout'
                  : `Charge ${totalLabel}`}
                <Kbd className="ml-1 border-white/25 bg-white/15 text-white shadow-none">F9</Kbd>
              </Button>
            </div>
          }
        />
      </Card>

      {/* Phones: the cart sits below the product grid, so keep a summary within thumb reach. */}
      <AnimatePresence>
        {cart.lines.length > 0 && (
          <motion.a
            href="#cart"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-2xl bg-brand-gradient px-5 py-3.5 text-white shadow-glow lg:hidden"
          >
            <span className="text-sm font-medium">
              {pluralize(cart.itemCount, 'item')} · View cart
            </span>
            <span className="text-base font-semibold">{totalLabel}</span>
          </motion.a>
        )}
      </AnimatePresence>

      <CameraScanDialog
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false)
          void addByCode(code)
        }}
      />
      <ReceiptDialog
        order={receipt}
        organizationName={organization.name}
        location={location}
        currency={currency}
        timeZone={organization.timezone}
        onNewSale={() => {
          setReceipt(null)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}

function CheckoutError({ error }: { error: Error }) {
  if (isApiError(error) && error.isNetworkError) {
    return (
      <Alert>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <WifiOff className="size-4" aria-hidden="true" /> Connection lost
        </span>
        <p className="mt-0.5">
          The sale wasn’t confirmed. Retrying is safe — it can’t be charged twice.
        </p>
      </Alert>
    )
  }
  if (isApiError(error, 'insufficient_stock')) {
    return (
      <Alert>Some items don’t have enough stock. Adjust the highlighted lines and try again.</Alert>
    )
  }
  return <Alert>{getErrorMessage(error)}</Alert>
}
