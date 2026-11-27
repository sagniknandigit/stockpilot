import { api, apiDownload } from './client'
import type {
  Category,
  ImportReport,
  Page,
  Product,
  ProductInput,
  ProductListParams,
  ProductUpdateInput,
  UUID,
  Variant,
  VariantInput,
  VariantSearchResult,
  VariantUpdateInput,
} from './types'

export const catalogApi = {
  listCategories: () => api.get<Category[]>('/catalog/categories'),
  createCategory: (name: string) => api.post<Category>('/catalog/categories', { name }),

  listProducts: (params: ProductListParams) => api.get<Page<Product>>('/catalog/products', params),
  getProduct: (id: UUID) => api.get<Product>(`/catalog/products/${id}`),
  createProduct: (input: ProductInput) => api.post<Product>('/catalog/products', input),
  updateProduct: (id: UUID, input: ProductUpdateInput) =>
    api.patch<Product>(`/catalog/products/${id}`, input),

  addVariant: (productId: UUID, input: VariantInput) =>
    api.post<Variant>(`/catalog/products/${productId}/variants`, input),
  updateVariant: (id: UUID, input: VariantUpdateInput) =>
    api.patch<Variant>(`/catalog/variants/${id}`, input),

  /** All SKUs as CSV (importer columns + current on-hand). */
  exportProducts: () => apiDownload('/catalog/products/export.csv'),
  /** Create/update products by SKU. All-or-nothing; `dryRun` validates without saving. */
  importProducts: (file: File, dryRun: boolean) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<ImportReport>('/catalog/products/import', form, { query: { dry_run: dryRun } })
  },

  /** POS lookup. Exact barcode/SKU matches are returned first. */
  searchVariants: (locationId: UUID, q: string, signal?: AbortSignal) =>
    api.get<VariantSearchResult[]>(
      '/catalog/variants/search',
      { location_id: locationId, q, limit: 50 },
      signal,
    ),
}
