import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Variant } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useAddVariant, useUpdateVariant } from '@/hooks/useCatalog'
import {
  emptyVariant,
  formToVariantInput,
  variantSchema,
  variantToForm,
  type VariantFormValues,
} from './variantSchema'

interface VariantDialogProps {
  productId: string
  /** The variant to edit, or null to add a new one. */
  variant: Variant | null
  open: boolean
  onClose: () => void
}

export function VariantDialog({ productId, variant, open, onClose }: VariantDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={variant ? `Edit ${variant.name}` : 'Add variant'}
      size="lg"
    >
      <VariantForm productId={productId} variant={variant} onDone={onClose} />
    </Dialog>
  )
}

function VariantForm({
  productId,
  variant,
  onDone,
}: {
  productId: string
  variant: Variant | null
  onDone: () => void
}) {
  const addVariant = useAddVariant(productId)
  const updateVariant = useUpdateVariant()
  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: variant ? variantToForm(variant) : emptyVariant(''),
  })
  const { errors } = form.formState
  const isEdit = variant !== null

  const onSubmit = form.handleSubmit((values) => {
    const input = formToVariantInput(values)
    const onSuccess = () => {
      toast.success(isEdit ? 'Variant updated' : 'Variant added')
      onDone()
    }
    if (variant) {
      // SKU is immutable once created (it is referenced by order lines).
      const { sku: _sku, ...update } = input
      updateVariant.mutate({ id: variant.id, input: update }, { onSuccess })
    } else {
      addVariant.mutate(input, { onSuccess })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Variant name" error={errors.name?.message}>
          {(props) => (
            <Input
              autoFocus
              placeholder="e.g. Large / Blue"
              {...props}
              {...form.register('name')}
            />
          )}
        </Field>
        <Field
          label="SKU"
          error={errors.sku?.message}
          hint={isEdit ? 'SKUs can’t be changed.' : undefined}
        >
          {(props) => <Input readOnly={isEdit} {...props} {...form.register('sku')} />}
        </Field>
        <Field label="Barcode" error={errors.barcode?.message}>
          {(props) => (
            <Input
              inputMode="numeric"
              placeholder="Optional"
              {...props}
              {...form.register('barcode')}
            />
          )}
        </Field>
        <Field label="Reorder point" error={errors.reorder_point?.message}>
          {(props) => <Input inputMode="numeric" {...props} {...form.register('reorder_point')} />}
        </Field>
        <Field label="Price" error={errors.price?.message}>
          {(props) => (
            <Input inputMode="decimal" placeholder="0.00" {...props} {...form.register('price')} />
          )}
        </Field>
        <Field label="Cost" error={errors.cost?.message}>
          {(props) => (
            <Input inputMode="decimal" placeholder="0.00" {...props} {...form.register('cost')} />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={addVariant.isPending || updateVariant.isPending}>
          {isEdit ? 'Save changes' : 'Add variant'}
        </Button>
      </div>
    </form>
  )
}
