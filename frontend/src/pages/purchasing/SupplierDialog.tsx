import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { Supplier } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/usePurchasing'
import { wholeNumberField } from '@/lib/validation'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  email: z.union([z.literal(''), z.email('Enter a valid email address')]),
  phone: z.string().trim().max(40),
  lead_time_days: wholeNumberField('Lead time').refine(
    (v) => v === '' || Number(v) <= 365,
    'At most 365 days',
  ),
  notes: z.string().trim(),
})
type SupplierForm = z.infer<typeof schema>

interface SupplierDialogProps {
  open: boolean
  supplier: Supplier | null
  onClose: () => void
}

export function SupplierDialog({ open, supplier, onClose }: SupplierDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={supplier ? `Edit ${supplier.name}` : 'Add supplier'}
    >
      <SupplierFormBody supplier={supplier} onDone={onClose} />
    </Dialog>
  )
}

function SupplierFormBody({ supplier, onDone }: { supplier: Supplier | null; onDone: () => void }) {
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const form = useForm<SupplierForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supplier?.name ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      lead_time_days: String(supplier?.lead_time_days ?? 7),
      notes: supplier?.notes ?? '',
    },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) => {
    const input = {
      name: values.name,
      email: values.email || null,
      phone: values.phone || null,
      lead_time_days: values.lead_time_days ? Number(values.lead_time_days) : 7,
      notes: values.notes || null,
    }
    const onSuccess = () => {
      toast.success(supplier ? 'Supplier updated' : 'Supplier added', input.name)
      onDone()
    }
    if (supplier) update.mutate({ id: supplier.id, input }, { onSuccess })
    else create.mutate(input, { onSuccess })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Name" error={errors.name?.message}>
        {(props) => (
          <Input autoFocus placeholder="Morning Dew Dairy" {...props} {...form.register('name')} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message}>
          {(props) => (
            <Input
              type="email"
              placeholder="orders@supplier.com"
              {...props}
              {...form.register('email')}
            />
          )}
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          {(props) => <Input type="tel" {...props} {...form.register('phone')} />}
        </Field>
      </div>
      <Field
        label="Lead time (days)"
        error={errors.lead_time_days?.message}
        hint="How long deliveries usually take. Used by reorder suggestions."
      >
        {(props) => <Input inputMode="numeric" {...props} {...form.register('lead_time_days')} />}
      </Field>
      <Field label="Notes" error={errors.notes?.message}>
        {(props) => (
          <Textarea rows={2} placeholder="Optional" {...props} {...form.register('notes')} />
        )}
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {supplier ? 'Save changes' : 'Add supplier'}
        </Button>
      </div>
    </form>
  )
}
