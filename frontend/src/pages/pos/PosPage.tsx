import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, MapPin, ScanBarcode, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { catalogApi } from '@/api/catalog'
import type { Location, Order, StockShortage, VariantSearchResult } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/PageLoader'
import { toast } from '@/components/ui/toast'
import { queryKeys } from '@/hooks/queryKeys'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useCreateOrder } from '@/hooks/useSales'
import { getErrorMessage, isApiError } from '@/lib/errors'
import { formatMoney, formatOrderNumber } from '@/lib/format'
import { fromCents, isValidAmount, toCents } from '@/lib/money'
import { createIdempotencyKey } from '@/lib/utils'
import { useCurrentLocation } from '@/providers/LocationContext'
import { CameraScanDialog } from './CameraScanDialog'
import { CartPanel } from './CartPanel'
import { ReceiptDialog } from './ReceiptDialog'
import { SearchResults } from './SearchResults'
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
    inputRef.current?.focus()
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label="Find products" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Point of sale</h1>
            <p className="mt-1 text-[13px] text-muted">
              Selling from <span className="font-medium text-foreground">{location.name}</span>.
              Scan a barcode or search, then press Enter.
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Scan barcode, or search by name or SKU…"
              aria-label="Scan or search products"
              autoComplete="off"
              spellCheck={false}
              className="h-12 rounded-xl pl-12 text-base"
            />
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="h-12 rounded-xl"
            onClick={() => setScanning(true)}
            aria-label="Scan with camera"
          >
            <Camera /> <span className="hidden sm:inline">Scan with camera</span>
          </Button>
        </div>

        <Card className="overflow-hidden">
          {search.isError ? (
            <Alert className="m-4">{getErrorMessage(search.error)}</Alert>
          ) : (
            <SearchResults
              results={search.data}
              isLoading={search.isPending}
              query={term}
              currency={currency}
              quantityInCart={quantityInCart}
              onAdd={addItem}
            />
          )}
        </Card>
      </section>

      <Card className="flex flex-col overflow-hidden lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]">
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
                      placeholder="Optional"
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

              <dl className="space-y-1.5 text-[13px] tabular-nums">
                <div className="flex justify-between text-muted">
                  <dt>
                    Subtotal · {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
                  </dt>
                  <dd>{formatMoney(fromCents(cart.subtotalCents), currency)}</dd>
                </div>
                {discountCents > 0 && (
                  <div className="flex justify-between text-muted">
                    <dt>Discount</dt>
                    <dd>−{formatMoney(fromCents(discountCents), currency)}</dd>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-lg font-semibold text-foreground">
                  <dt>Total</dt>
                  <dd>{formatMoney(fromCents(Math.max(totalCents, 0)), currency)}</dd>
                </div>
              </dl>

              {checkoutError && <CheckoutError error={checkoutError} />}

              <Button
                size="lg"
                className="w-full"
                onClick={checkout}
                loading={pending}
                disabled={cart.lines.length === 0 || cart.hasProblems || Boolean(discountError)}
              >
                {checkoutError && isApiError(checkoutError) && checkoutError.isNetworkError
                  ? 'Retry checkout'
                  : `Charge ${formatMoney(fromCents(Math.max(totalCents, 0)), currency)}`}
              </Button>
            </div>
          }
        />
      </Card>

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
