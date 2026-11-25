import { z } from 'zod'
import type { Variant, VariantInput } from '@/api/types'
import { moneyField, optionalMoneyField, skuField, wholeNumberField } from '@/lib/validation'

export const variantSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  sku: skuField,
  barcode: z.string().trim().max(64, 'Barcode must be at most 64 characters'),
  price: moneyField('Price'),
  cost: optionalMoneyField('Cost'),
  reorder_point: wholeNumberField('Reorder point'),
})

export type VariantFormValues = z.infer<typeof variantSchema>

export const emptyVariant = (name = 'Default'): VariantFormValues => ({
  name,
  sku: '',
  barcode: '',
  price: '',
  cost: '',
  reorder_point: '0',
})

export function variantToForm(variant: Variant): VariantFormValues {
  return {
    name: variant.name,
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    price: variant.price,
    cost: variant.cost,
    reorder_point: String(variant.reorder_point),
  }
}

/** Form strings -> API payload (empty optional fields become null/defaults). */
export function formToVariantInput(values: VariantFormValues): VariantInput {
  return {
    name: values.name,
    sku: values.sku,
    barcode: values.barcode || null,
    price: values.price,
    cost: values.cost || '0',
    reorder_point: values.reorder_point ? Number(values.reorder_point) : 0,
  }
}
