import { ArrowLeft, PackageOpen, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { PurchaseOrder, Supplier } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/PageLoader'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { useVariantLookup } from '@/hooks/useCatalog'
import {
  useCreatePurchaseOrder,
  usePurchaseOrder,
  useSuppliers,
  useUpdatePurchaseOrder,
} from '@/hooks/usePurchasing'
import { getErrorMessage } from '@/lib/errors'
import { addDays, formatMoney, todayIn } from '@/lib/format'
import { fromCents, isValidAmount, toCents } from '@/lib/money'
import { useCurrentLocation } from '@/providers/LocationContext'
import { formatPoNumber } from './status'
import { VariantPicker } from './VariantPicker'

interface DraftLine {
  variantId: string
  label: string
  sku: string
  quantity: string
  unitCost: string
}

/** /purchasing/new and /purchasing/orders/:id/edit (drafts only). */
export function PurchaseOrderEditorPage() {
  const { poId } = useParams<{ poId: string }>()
  const existing = usePurchaseOrder(poId)
  const suppliers = useSuppliers()
  const { location, isLoading } = useCurrentLocation()

  if (isLoading || suppliers.isPending || (poId && existing.isPending)) return <PageLoader />
  if (existing.isError) return <Alert>{getErrorMessage(existing.error)}</Alert>
  if (existing.data && existing.data.status !== 'draft') {
    return <Alert>Only draft purchase orders can be edited.</Alert>
  }
  return (
    <PurchaseOrderEditor
      key={poId ?? 'new'}
      order={existing.data ?? null}
      suppliers={suppliers.data ?? []}
      defaultLocationId={location?.id ?? ''}
    />
  )
}

function PurchaseOrderEditor({
  order,
  suppliers,
  defaultLocationId,
}: {
  order: PurchaseOrder | null
  suppliers: Supplier[]
  defaultLocationId: string
}) {
  const navigate = useNavigate()
  const { organization } = useSession()
  const { locations } = useCurrentLocation()
  const variantCosts = useVariantLookup()
  const create = useCreatePurchaseOrder()
  const update = useUpdatePurchaseOrder(order?.id ?? '')
  const today = todayIn(organization.timezone)

  const [supplierId, setSupplierId] = useState(order?.supplier_id ?? '')
  const [locationId, setLocationId] = useState(order?.location_id ?? defaultLocationId)
  const [expectedAt, setExpectedAt] = useState(order?.expected_at ?? '')
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [lines, setLines] = useState<DraftLine[]>(
    () =>
      order?.lines.map((line) => ({
        variantId: line.variant_id,
        label: line.name,
        sku: line.sku,
        quantity: String(line.quantity_ordered),
        unitCost: line.unit_cost,
      })) ?? [],
  )
  const [submitted, setSubmitted] = useState(false)

  const supplier = suppliers.find((s) => s.id === supplierId)
  const lineErrors = lines.map((line) => ({
    quantity:
      /^\d+$/.test(line.quantity) && Number(line.quantity) > 0 ? undefined : 'Enter a quantity ≥ 1',
    unitCost: isValidAmount(line.unitCost) ? undefined : 'Enter a cost like 12.50',
  }))
  const lineCents = (line: DraftLine, i: number) =>
    lineErrors[i].quantity || lineErrors[i].unitCost
      ? 0
      : toCents(line.unitCost) * Number(line.quantity)
  const totalCents = lines.reduce((sum, line, i) => sum + lineCents(line, i), 0)
  const errors = {
    supplier: supplierId ? undefined : 'Choose a supplier',
    location: locationId ? undefined : 'Choose a location',
    lines: lines.length ? undefined : 'Add at least one product',
  }
  const valid =
    !errors.supplier &&
    !errors.location &&
    !errors.lines &&
    lineErrors.every((e) => !e.quantity && !e.unitCost)

  function updateLine(variantId: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)),
    )
  }

  function save() {
    setSubmitted(true)
    if (!valid) return
    const input = {
      supplier_id: supplierId,
      location_id: locationId,
      expected_at: expectedAt || null,
      notes: notes.trim() || null,
      lines: lines.map((line) => ({
        variant_id: line.variantId,
        quantity: Number(line.quantity),
        unit_cost: fromCents(toCents(line.unitCost)),
      })),
    }
    const onSuccess = (po: PurchaseOrder) => {
      toast.success(
        order ? 'Draft saved' : `${formatPoNumber(po.number)} created`,
        'Submit it to the supplier when ready.',
      )
      navigate(`/purchasing/orders/${po.id}`)
    }
    if (order) update.mutate(input, { onSuccess })
    else create.mutate(input, { onSuccess })
  }

  return (
    <>
      <Link
        to={order ? `/purchasing/orders/${order.id}` : '/purchasing'}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />{' '}
        {order ? formatPoNumber(order.number) : 'Purchasing'}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        {order ? `Edit ${formatPoNumber(order.number)}` : 'New purchase order'}
      </h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Products" description="Quantities and unit costs to order." />
          <div className="px-5 pb-2">
            <VariantPicker
              locationId={locationId || defaultLocationId}
              excludeIds={new Set(lines.map((l) => l.variantId))}
              onPick={(variant) =>
                setLines((current) => [
                  ...current,
                  {
                    variantId: variant.id,
                    label:
                      variant.name === 'Default'
                        ? variant.product_name
                        : `${variant.product_name} - ${variant.name}`,
                    sku: variant.sku,
                    quantity: '1',
                    // Default to the variant's current (weighted-average) cost.
                    unitCost: variantCosts.data?.get(variant.id)?.cost ?? '0.00',
                  },
                ])
              }
            />
          </div>
          {lines.length === 0 ? (
            <EmptyState
              compact
              icon={PackageOpen}
              title="No products yet"
              description="Search above to add the products you want to order."
            />
          ) : (
            <ul className="divide-y" aria-label="Order lines">
              <AnimatePresence initial={false}>
                {lines.map((line, i) => (
                  <motion.li
                    key={line.variantId}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_96px_120px_110px_auto]"
                  >
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate font-medium text-foreground">{line.label}</p>
                      <p className="font-mono text-xs text-muted">{line.sku}</p>
                    </div>
                    <Field
                      label="Qty"
                      error={submitted ? lineErrors[i].quantity : undefined}
                      className="[&_label]:sr-only sm:[&_label]:not-sr-only"
                    >
                      {(props) => (
                        <Input
                          {...props}
                          inputMode="numeric"
                          value={line.quantity}
                          aria-label={`Quantity of ${line.sku}`}
                          onChange={(event) =>
                            updateLine(line.variantId, { quantity: event.target.value })
                          }
                        />
                      )}
                    </Field>
                    <Field
                      label="Unit cost"
                      error={submitted ? lineErrors[i].unitCost : undefined}
                      className="[&_label]:sr-only sm:[&_label]:not-sr-only"
                    >
                      {(props) => (
                        <Input
                          {...props}
                          inputMode="decimal"
                          value={line.unitCost}
                          aria-label={`Unit cost of ${line.sku}`}
                          onChange={(event) =>
                            updateLine(line.variantId, { unitCost: event.target.value })
                          }
                        />
                      )}
                    </Field>
                    <p className="self-center text-right font-semibold text-foreground sm:pt-5">
                      {formatMoney(fromCents(lineCents(line, i)), organization.currency)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="self-center text-muted hover:text-danger-ink sm:mt-5"
                      onClick={() =>
                        setLines((current) => current.filter((l) => l.variantId !== line.variantId))
                      }
                      aria-label={`Remove ${line.sku}`}
                    >
                      <Trash2 />
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {submitted && errors.lines && <Alert className="m-5">{errors.lines}</Alert>}
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-4 p-5">
            <Field
              label="Supplier"
              error={submitted ? errors.supplier : undefined}
              hint={supplier && `Usually delivers in ${supplier.lead_time_days} days`}
            >
              {(props) => (
                <Select
                  {...props}
                  value={supplierId}
                  onChange={(event) => {
                    const next = suppliers.find((s) => s.id === event.target.value)
                    setSupplierId(event.target.value)
                    // Suggest an expected date from the supplier's lead time.
                    if (next && !expectedAt) setExpectedAt(addDays(today, next.lead_time_days))
                  }}
                >
                  <option value="">Choose a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Deliver to" error={submitted ? errors.location : undefined}>
              {(props) => (
                <Select
                  {...props}
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Expected delivery">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  min={today}
                  value={expectedAt}
                  onChange={(event) => setExpectedAt(event.target.value)}
                />
              )}
            </Field>
            <Field label="Notes">
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={notes}
                  placeholder="Optional"
                  onChange={(event) => setNotes(event.target.value)}
                />
              )}
            </Field>
          </Card>
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-muted">
                {lines.length} {lines.length === 1 ? 'line' : 'lines'}
              </span>
              <span className="text-2xl font-semibold tracking-tight text-foreground">
                {formatMoney(fromCents(totalCents), organization.currency)}
              </span>
            </div>
            <Button
              size="lg"
              className="mt-4 w-full"
              onClick={save}
              loading={create.isPending || update.isPending}
            >
              {order ? 'Save draft' : 'Create draft'}
            </Button>
            <p className="mt-2 text-center text-xs text-muted">
              Nothing is sent to the supplier until you submit.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
