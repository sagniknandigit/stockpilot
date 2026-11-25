import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, PackageX, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import type { Product, Variant } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/PageLoader'
import { Switch } from '@/components/ui/Switch'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { toast } from '@/components/ui/toast'
import { useProduct, useUpdateProduct, useUpdateVariant } from '@/hooks/useCatalog'
import { getErrorMessage, isApiError } from '@/lib/errors'
import { formatDate, formatMoney, pluralize } from '@/lib/format'
import { CategoryField } from './CategoryField'
import { VariantDialog } from './VariantDialog'

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const product = useProduct(productId)

  if (product.isPending) return <PageLoader />
  if (product.isError) {
    return (
      <>
        <BackLink />
        {isApiError(product.error, 'not_found') ? (
          <EmptyState
            icon={PackageX}
            title="Product not found"
            description="It may have been removed."
          />
        ) : (
          <Alert>{getErrorMessage(product.error)}</Alert>
        )}
      </>
    )
  }
  // Keyed by id so local UI state (dialogs, form) resets when switching products.
  return <ProductDetail key={product.data.id} product={product.data} />
}

function BackLink() {
  return (
    <Link
      to="/products"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Products
    </Link>
  )
}

const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim(),
  category_id: z.string(),
})
type DetailsForm = z.infer<typeof detailsSchema>

function ProductDetail({ product }: { product: Product }) {
  const { organization } = useSession()
  const canManage = useCan('manager')
  const updateProduct = useUpdateProduct(product.id)
  const updateVariant = useUpdateVariant()
  const [variantDialog, setVariantDialog] = useState<{ variant: Variant | null } | null>(null)

  const form = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    values: {
      name: product.name,
      description: product.description ?? '',
      category_id: product.category?.id ?? '',
    },
  })
  const { errors, isDirty } = form.formState

  const onSubmit = form.handleSubmit((values) =>
    updateProduct.mutate(
      {
        name: values.name,
        description: values.description || null,
        category_id: values.category_id || null,
      },
      { onSuccess: () => toast.success('Product saved') },
    ),
  )

  return (
    <>
      <BackLink />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {product.name}
            </h1>
            {product.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {product.category?.name ?? 'Uncategorized'} · Added{' '}
            {formatDate(product.created_at, organization.timezone)}
          </p>
        </div>
        {canManage && (
          <Switch
            label={product.is_active ? 'Active' : 'Inactive'}
            checked={product.is_active}
            disabled={updateProduct.isPending}
            onChange={(is_active) =>
              updateProduct.mutate(
                { is_active },
                {
                  onSuccess: () =>
                    toast.success(is_active ? 'Product activated' : 'Product deactivated'),
                },
              )
            }
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
            <fieldset disabled={!canManage} className="space-y-4">
              <Field label="Name" error={errors.name?.message}>
                {(props) => <Input {...props} {...form.register('name')} />}
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
              <Field label="Description">
                {(props) => <Textarea rows={4} {...props} {...form.register('description')} />}
              </Field>
            </fieldset>
            {canManage && (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => form.reset()} disabled={!isDirty}>
                  Reset
                </Button>
                <Button type="submit" loading={updateProduct.isPending} disabled={!isDirty}>
                  Save
                </Button>
              </div>
            )}
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Variants"
            description={`${pluralize(product.variants.length, 'sellable variant')}`}
            actions={
              canManage && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setVariantDialog({ variant: null })}
                >
                  <Plus /> Add variant
                </Button>
              )
            }
          />
          <Table>
            <THead>
              <TR>
                <TH>Variant</TH>
                <TH>Barcode</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Cost</TH>
                <TH className="text-right">Reorder at</TH>
                <TH>Status</TH>
                {canManage && (
                  <TH className="w-px">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </TR>
            </THead>
            <TBody>
              {product.variants.map((variant) => (
                <TR key={variant.id}>
                  <TD className="min-w-32">
                    <p className="font-medium text-foreground">{variant.name}</p>
                    <p className="font-mono text-xs text-muted">{variant.sku}</p>
                  </TD>
                  <TD className="font-mono text-xs text-muted">{variant.barcode ?? '—'}</TD>
                  <TD className="text-right tabular-nums">
                    {formatMoney(variant.price, organization.currency)}
                  </TD>
                  <TD className="text-right text-muted tabular-nums">
                    {formatMoney(variant.cost, organization.currency)}
                  </TD>
                  <TD className="text-right tabular-nums">{variant.reorder_point}</TD>
                  <TD>
                    {canManage ? (
                      <Switch
                        label={variant.is_active ? 'Active' : 'Off'}
                        checked={variant.is_active}
                        disabled={updateVariant.isPending}
                        onChange={(is_active) =>
                          updateVariant.mutate({ id: variant.id, input: { is_active } })
                        }
                      />
                    ) : variant.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge>Inactive</Badge>
                    )}
                  </TD>
                  {canManage && (
                    <TD>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setVariantDialog({ variant })}
                        aria-label={`Edit ${variant.name}`}
                      >
                        <Pencil />
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <VariantDialog
        productId={product.id}
        variant={variantDialog?.variant ?? null}
        open={variantDialog !== null}
        onClose={() => setVariantDialog(null)}
      />
    </>
  )
}
