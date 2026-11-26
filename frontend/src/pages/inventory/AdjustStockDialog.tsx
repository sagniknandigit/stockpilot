import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { StockRow } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { useAdjustStock } from '@/hooks/useInventory'
import { cn } from '@/lib/utils'

const schema = z
  .object({
    quantity: z
      .string()
      .trim()
      .regex(/^[+-]?\d+$/, 'Enter a whole number, e.g. 10 or -3')
      .refine((v) => Number(v) !== 0, 'Quantity must not be zero')
      .refine((v) => Math.abs(Number(v)) <= 1_000_000, 'Quantity is too large'),
    reason: z.enum(['initial', 'adjustment', 'damage']),
    note: z.string().trim().max(500),
  })
  .refine((v) => v.reason !== 'damage' || Number(v.quantity) < 0, {
    path: ['quantity'],
    message: 'Damage write-offs must be negative',
  })
type AdjustForm = z.infer<typeof schema>

interface AdjustStockDialogProps {
  row: StockRow | null
  onClose: () => void
}

export function AdjustStockDialog({ row, onClose }: AdjustStockDialogProps) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Adjust stock"
      description={
        row && `${row.product_name} · ${row.variant_name} (${row.sku}) at ${row.location_code}`
      }
    >
      {row && <AdjustForm row={row} onDone={onClose} />}
    </Dialog>
  )
}

function AdjustForm({ row, onDone }: { row: StockRow; onDone: () => void }) {
  const adjust = useAdjustStock()
  const form = useForm<AdjustForm>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: '', reason: row.on_hand === 0 ? 'initial' : 'adjustment', note: '' },
  })
  const { errors } = form.formState
  const quantity = useWatch({ control: form.control, name: 'quantity' })
  const delta = /^[+-]?\d+$/.test(quantity.trim()) ? Number(quantity) : 0
  const projected = row.on_hand + delta

  const onSubmit = form.handleSubmit((values) =>
    adjust.mutate(
      {
        variant_id: row.variant_id,
        location_id: row.location_id,
        quantity: Number(values.quantity),
        reason: values.reason,
        note: values.note || null,
      },
      {
        onSuccess: (level) => {
          toast.success(
            'Stock updated',
            `${row.sku} at ${row.location_code}: ${level.on_hand} on hand`,
          )
          onDone()
        },
      },
    ),
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-center">
        <Stat label="On hand" value={row.on_hand} />
        <Stat
          label="Change"
          value={delta > 0 ? `+${delta}` : delta}
          className={cn(delta > 0 && 'text-success-ink', delta < 0 && 'text-danger-ink')}
        />
        <Stat
          label="New on hand"
          value={projected}
          className={cn(projected < 0 && 'text-danger-ink')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Quantity (+/−)"
          error={errors.quantity?.message}
          hint="Use a negative number to remove stock."
        >
          {(props) => (
            <Input
              autoFocus
              inputMode="numeric"
              placeholder="e.g. 24 or -2"
              {...props}
              {...form.register('quantity')}
            />
          )}
        </Field>
        <Field label="Reason" error={errors.reason?.message}>
          {(props) => (
            <Select {...props} {...form.register('reason')}>
              <option value="initial">Initial stock</option>
              <option value="adjustment">Count adjustment</option>
              <option value="damage">Damage / write-off</option>
            </Select>
          )}
        </Field>
        <Field label="Note" error={errors.note?.message} className="sm:col-span-2">
          {(props) => (
            <Textarea rows={2} placeholder="Optional" {...props} {...form.register('note')} />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={adjust.isPending}>
          Save adjustment
        </Button>
      </div>
    </form>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: number | string
  className?: string
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('text-lg font-semibold text-foreground tabular-nums', className)}>{value}</p>
    </div>
  )
}
