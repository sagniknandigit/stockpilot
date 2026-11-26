import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useCreateProduct } from '@/hooks/useCatalog'
import { pluralize } from '@/lib/format'
import { CategoryField } from './CategoryField'
import { emptyVariant, formToVariantInput, variantSchema } from './variantSchema'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    description: z.string().trim(),
    category_id: z.string(),
    variants: z.array(variantSchema).min(1, 'Add at least one variant'),
  })
  .superRefine((values, ctx) => {
    // Mirror the backend rule: SKUs must be unique within the product (case-insensitive).
    const seen = new Map<string, number>()
    values.variants.forEach((variant, index) => {
      const key = variant.sku.trim().toLowerCase()
      if (!key) return
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['variants', index, 'sku'], message: 'Duplicate SKU' })
      }
      seen.set(key, index)
    })
  })

type ProductForm = z.infer<typeof schema>

export function NewProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New product"
      description="Add a product and its sellable variants (sizes, colors…)."
      size="xl"
    >
      <NewProductForm onDone={onClose} />
    </Dialog>
  )
}

function NewProductForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const createProduct = useCreateProduct()
  const form = useForm<ProductForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', category_id: '', variants: [emptyVariant()] },
  })
  const variants = useFieldArray({ control: form.control, name: 'variants' })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) => {
    createProduct.mutate(
      {
        name: values.name,
        description: values.description || null,
        category_id: values.category_id || null,
        variants: values.variants.map(formToVariantInput),
      },
      {
        onSuccess: (product) => {
          toast.success(
            'Product created',
            `${product.name} with ${pluralize(product.variants.length, 'variant')}`,
          )
          onDone()
          navigate(`/products/${product.id}`)
        },
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" error={errors.name?.message}>
          {(props) => (
            <Input
              autoFocus
              placeholder="e.g. Cotton T-Shirt"
              {...props}
              {...form.register('name')}
            />
          )}
        </Field>
        <Field label="Category">
          {({ id }) => (
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <CategoryField id={id} value={field.value} onChange={field.onChange} />
              )}
            />
          )}
        </Field>
        <Field label="Description" className="sm:col-span-2">
          {(props) => <Textarea rows={2} {...props} {...form.register('description')} />}
        </Field>
      </div>

      <fieldset>
        <div className="mb-3 flex items-center justify-between">
          <legend className="text-sm font-semibold text-foreground">Variants</legend>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => variants.append(emptyVariant(`Variant ${variants.fields.length + 1}`))}
          >
            <Plus /> Add variant
          </Button>
        </div>
        <div className="space-y-3">
          {variants.fields.map((field, index) => {
            const e = errors.variants?.[index]
            return (
              <div key={field.id} className="rounded-lg border bg-subtle/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-medium tracking-wide text-muted uppercase">
                    Variant {index + 1}
                  </p>
                  {variants.fields.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-my-1 text-danger-ink"
                      onClick={() => variants.remove(index)}
                      aria-label={`Remove variant ${index + 1}`}
                    >
                      <Trash2 /> Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-6">
                  <Field label="Variant name" error={e?.name?.message} className="sm:col-span-2">
                    {(props) => <Input {...props} {...form.register(`variants.${index}.name`)} />}
                  </Field>
                  <Field label="SKU" error={e?.sku?.message} className="sm:col-span-2">
                    {(props) => (
                      <Input
                        placeholder="TSHIRT-M"
                        {...props}
                        {...form.register(`variants.${index}.sku`)}
                      />
                    )}
                  </Field>
                  <Field label="Barcode" error={e?.barcode?.message} className="sm:col-span-2">
                    {(props) => (
                      <Input
                        inputMode="numeric"
                        placeholder="Optional"
                        {...props}
                        {...form.register(`variants.${index}.barcode`)}
                      />
                    )}
                  </Field>
                  <Field label="Price" error={e?.price?.message} className="sm:col-span-2">
                    {(props) => (
                      <Input
                        inputMode="decimal"
                        placeholder="0.00"
                        {...props}
                        {...form.register(`variants.${index}.price`)}
                      />
                    )}
                  </Field>
                  <Field label="Cost" error={e?.cost?.message} className="sm:col-span-2">
                    {(props) => (
                      <Input
                        inputMode="decimal"
                        placeholder="0.00"
                        {...props}
                        {...form.register(`variants.${index}.cost`)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Reorder point"
                    error={e?.reorder_point?.message}
                    className="sm:col-span-2"
                  >
                    {(props) => (
                      <Input
                        inputMode="numeric"
                        {...props}
                        {...form.register(`variants.${index}.reorder_point`)}
                      />
                    )}
                  </Field>
                </div>
              </div>
            )
          })}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={createProduct.isPending}>
          Create product
        </Button>
      </div>
    </form>
  )
}
