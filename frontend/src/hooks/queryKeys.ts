import type {
  MovementListParams,
  OrderListParams,
  ProductListParams,
  StockListParams,
  UUID,
} from '@/api/types'

/**
 * Query-key factory. Keys are hierarchical so a mutation can invalidate a whole domain
 * (e.g. `queryKeys.inventory.all`) or something narrow (one product).
 */
export const queryKeys = {
  catalog: {
    all: ['catalog'] as const,
    categories: () => [...queryKeys.catalog.all, 'categories'] as const,
    products: (params: ProductListParams) =>
      [...queryKeys.catalog.all, 'products', params] as const,
    product: (id: UUID) => [...queryKeys.catalog.all, 'product', id] as const,
    variantLookup: () => [...queryKeys.catalog.all, 'variant-lookup'] as const,
    /** Prefix of every POS search query; invalidate it whenever availability changes. */
    variantSearches: () => [...queryKeys.catalog.all, 'variant-search'] as const,
    variantSearch: (locationId: UUID, q: string) =>
      [...queryKeys.catalog.variantSearches(), locationId, q] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    locations: () => [...queryKeys.inventory.all, 'locations'] as const,
    stock: (params: StockListParams) => [...queryKeys.inventory.all, 'stock', params] as const,
    movements: (params: MovementListParams) =>
      [...queryKeys.inventory.all, 'movements', params] as const,
    reconcile: () => [...queryKeys.inventory.all, 'reconcile'] as const,
  },
  sales: {
    all: ['sales'] as const,
    orders: (params: OrderListParams) => [...queryKeys.sales.all, 'orders', params] as const,
    order: (id: UUID) => [...queryKeys.sales.all, 'order', id] as const,
  },
  reports: {
    all: ['reports'] as const,
    summary: () => [...queryKeys.reports.all, 'summary'] as const,
  },
  users: {
    all: ['users'] as const,
  },
}
