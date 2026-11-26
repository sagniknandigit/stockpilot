import { useState } from 'react'
import type { PurchaseOrder } from '@/api/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { usePurchaseOrderAction } from '@/hooks/usePurchasing'
import { formatPoNumber } from './status'

interface ReceiveDialogProps {
  order: PurchaseOrder
  open: boolean
  onClose: () => void
}

export function ReceiveDialog({ order, open, onClose }: ReceiveDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Receive ${formatPoNumber(order.number)}`}
      description={`Count what arrived from ${order.supplier_name}. Stock is added at ${order.location_code}.`}
    >
      <ReceiveForm order={order} onDone={onClose} />
    </Dialog>
  )
}

function ReceiveForm({ order, onDone }: { order: PurchaseOrder; onDone: () => void }) {
  const { receive } = usePurchaseOrderAction(order.id)
  const outstanding = order.lines.filter((line) => line.quantity_outstanding > 0)
  // Prefilled with everything still outstanding: the common case is "it all arrived".
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(outstanding.map((line) => [line.id, String(line.quantity_outstanding)])),
  )
  const [note, setNote] = useState('')

  const errors = Object.fromEntries(
    outstanding.map((line) => {
      const raw = quantities[line.id]?.trim() ?? ''
      const valid = raw === '' || (/^\d+$/.test(raw) && Number(raw) <= line.quantity_outstanding)
      return [line.id, valid ? undefined : `0–${line.quantity_outstanding}`]
    }),
  )
  const toReceive = outstanding
    .map((line) => ({ line_id: line.id, quantity: Number(quantities[line.id] || 0) }))
    .filter((l) => l.quantity > 0)
  const units = toReceive.reduce((sum, l) => sum + l.quantity, 0)
  const invalid = Object.values(errors).some(Boolean) || units === 0

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (invalid) return
        receive.mutate(
          { lines: toReceive, note: note.trim() || null },
          {
            onSuccess: (po) => {
              toast.success(
                po.status === 'received'
                  ? `${formatPoNumber(po.number)} fully received`
                  : 'Delivery received',
                `${units} units added to ${po.location_code}`,
              )
              onDone()
            },
          },
        )
      }}
    >
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Outstanding</th>
              <th className="w-32 px-4 py-2">Received now</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {outstanding.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-foreground">{line.name}</p>
                  <p className="font-mono text-xs text-muted">{line.sku}</p>
                </td>
                <td className="px-4 py-2.5 text-right text-muted">{line.quantity_outstanding}</td>
                <td className="px-4 py-2.5">
                  <Input
                    inputMode="numeric"
                    aria-label={`Received quantity of ${line.sku}`}
                    aria-invalid={errors[line.id] ? true : undefined}
                    value={quantities[line.id] ?? ''}
                    onChange={(event) =>
                      setQuantities((q) => ({ ...q, [line.id]: event.target.value }))
                    }
                  />
                  {errors[line.id] && (
                    <p className="mt-1 text-xs text-danger-ink">Enter {errors[line.id]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Textarea
        rows={2}
        aria-label="Delivery note"
        placeholder="Delivery note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {units === 0 && <Alert tone="info">Enter at least one quantity to receive.</Alert>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={receive.isPending} disabled={invalid}>
          Receive {units} units
        </Button>
      </div>
    </form>
  )
}
