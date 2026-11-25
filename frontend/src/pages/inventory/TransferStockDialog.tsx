import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { Location, StockRow } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { useTransferStock } from '@/hooks/useInventory'

interface TransferStockDialogProps {
  row: StockRow | null
  locations: Location[]
  onClose: () => void
}

export function TransferStockDialog({ row, locations, onClose }: TransferStockDialogProps) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Transfer stock"
      description={row && `${row.product_name} · ${row.variant_name} (${row.sku})`}
    >
      {row && <TransferForm row={row} locations={locations} onDone={onClose} />}
    </Dialog>
  )
}

function TransferForm({
  row,
  locations,
  onDone,
}: {
  row: StockRow
  locations: Location[]
  onDone: () => void
}) {
  const transfer = useTransferStock()
  const destinations = locations.filter((l) => l.id !== row.location_id)
  const schema = z.object({
    to_location_id: z.string().min(1, 'Choose a destination'),
    quantity: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Enter a whole number')
      .refine((v) => Number(v) > 0, 'Quantity must be at least 1')
      .refine((v) => Number(v) <= row.available, `Only ${row.available} available to move`),
    note: z.string().trim().max(500),
  })
  type TransferForm = z.infer<typeof schema>

  const form = useForm<TransferForm>({
    resolver: zodResolver(schema),
    defaultValues: { to_location_id: destinations[0]?.id ?? '', quantity: '', note: '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) =>
    transfer.mutate(
      {
        variant_id: row.variant_id,
        from_location_id: row.location_id,
        to_location_id: values.to_location_id,
        quantity: Number(values.quantity),
        note: values.note || null,
      },
      {
        onSuccess: () => {
          const to = destinations.find((l) => l.id === values.to_location_id)
          toast.success(
            'Transfer complete',
            `${values.quantity} × ${row.sku}: ${row.location_code} → ${to?.code}`,
          )
          onDone()
        },
      },
    ),
  )

  if (destinations.length === 0) {
    return <p className="text-muted">Add a second location to transfer stock between stores.</p>
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Field label="From">
          {(props) => (
            <Input
              {...props}
              value={`${row.location_code} · ${row.available} available`}
              readOnly
            />
          )}
        </Field>
        <ArrowRight className="mb-2.5 size-4 text-muted" aria-hidden="true" />
        <Field label="To" error={errors.to_location_id?.message}>
          {(props) => (
            <Select {...props} {...form.register('to_location_id')}>
              {destinations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Quantity" error={errors.quantity?.message}>
        {(props) => (
          <Input autoFocus inputMode="numeric" {...props} {...form.register('quantity')} />
        )}
      </Field>
      <Field label="Note" error={errors.note?.message}>
        {(props) => (
          <Textarea rows={2} placeholder="Optional" {...props} {...form.register('note')} />
        )}
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={transfer.isPending}>
          Transfer
        </Button>
      </div>
    </form>
  )
}
