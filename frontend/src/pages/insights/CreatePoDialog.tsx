import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { ReorderSuggestion } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { useCreatePurchaseOrderFromSuggestions, useSuppliers } from '@/hooks/usePurchasing'
import { formatPoNumber } from '@/pages/purchasing/status'
import { useCurrentLocation } from '@/providers/LocationContext'

interface CreatePoDialogProps {
  items: ReorderSuggestion[]
  open: boolean
  onClose: () => void
}

/** Turn selected suggestions into a draft PO (suggested quantities, current costs). */
export function CreatePoDialog({ items, open, onClose }: CreatePoDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create purchase order"
      description={`A draft with ${items.length} suggested ${items.length === 1 ? 'line' : 'lines'}. You can edit it before submitting.`}
    >
      <CreatePoForm items={items} onDone={onClose} />
    </Dialog>
  )
}

function CreatePoForm({ items, onDone }: { items: ReorderSuggestion[]; onDone: () => void }) {
  const navigate = useNavigate()
  const suppliers = useSuppliers()
  const { location, locations } = useCurrentLocation()
  const create = useCreatePurchaseOrderFromSuggestions()
  // Default to the supplier these items were last bought from, when they all agree.
  const lastSuppliers = new Set(items.map((i) => i.last_supplier_id).filter(Boolean))
  const sharedSupplier = lastSuppliers.size === 1 ? [...lastSuppliers][0]! : ''
  const [supplierId, setSupplierId] = useState(sharedSupplier)
  const [locationId, setLocationId] = useState(location?.id ?? '')

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!supplierId || !locationId) return
        create.mutate(
          {
            supplier_id: supplierId,
            location_id: locationId,
            variant_ids: items.map((i) => i.variant_id),
          },
          {
            onSuccess: (po) => {
              toast.success(
                `${formatPoNumber(po.number)} drafted`,
                'Review the quantities, then submit it.',
              )
              onDone()
              navigate(`/purchasing/orders/${po.id}`)
            },
          },
        )
      }}
    >
      <Field
        label="Supplier"
        hint={
          sharedSupplier
            ? 'Last supplier for these items.'
            : lastSuppliers.size > 1
              ? 'These items came from different suppliers — pick one, or create separate orders.'
              : undefined
        }
      >
        {(props) => (
          <Select
            {...props}
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            required
          >
            <option value="">Choose a supplier…</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Deliver to">
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
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!supplierId || !locationId}>
          Create draft
        </Button>
      </div>
    </form>
  )
}
