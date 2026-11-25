import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogApi } from '@/api/catalog'
import type {
  ProductInput,
  ProductListParams,
  ProductUpdateInput,
  UUID,
  Variant,
  VariantInput,
  VariantUpdateInput,
} from '@/api/types'
import { queryKeys } from './queryKeys'

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: catalogApi.listCategories,
    staleTime: 60_000,
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: catalogApi.createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.categories() }),
  })
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: queryKeys.catalog.products(params),
    queryFn: () => catalogApi.listProducts(params),
    placeholderData: keepPreviousData,
  })
}

export function useProduct(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.catalog.product(id ?? ''),
    queryFn: () => catalogApi.getProduct(id!),
    enabled: Boolean(id),
  })
}

/**
 * Catalog changes ripple into stock rows, POS search and dashboard counts, so they
 * invalidate those domains too.
 */
function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
    ])
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (input: ProductInput) => catalogApi.createProduct(input),
    onSuccess: invalidate,
  })
}

export function useUpdateProduct(id: UUID) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (input: ProductUpdateInput) => catalogApi.updateProduct(id, input),
    onSuccess: (product) => {
      queryClient.setQueryData(queryKeys.catalog.product(id), product)
      return invalidate()
    },
  })
}

export function useAddVariant(productId: UUID) {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (input: VariantInput) => catalogApi.addVariant(productId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateVariant() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: VariantUpdateInput }) =>
      catalogApi.updateVariant(id, input),
    onSuccess: invalidate,
  })
}

export interface VariantLabel {
  productName: string
  variantName: string
  sku: string
}

/**
 * Reconcile mismatches only carry variant ids. This builds an id -> label map from the first
 * 100 products (including inactive ones), which covers a small shop's catalog. Mismatches are
 * expected to be rare, so unknown ids simply fall back to a short id.
 */
export function useVariantLookup() {
  return useQuery({
    queryKey: queryKeys.catalog.variantLookup(),
    queryFn: () => catalogApi.listProducts({ size: 100, include_inactive: true }),
    staleTime: 60_000,
    select: (page) => {
      const map = new Map<UUID, VariantLabel>()
      for (const product of page.items) {
        product.variants.forEach((variant: Variant) =>
          map.set(variant.id, {
            productName: product.name,
            variantName: variant.name,
            sku: variant.sku,
          }),
        )
      }
      return map
    },
  })
}
