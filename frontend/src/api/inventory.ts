import { api } from './client'
import type {
  AdjustmentInput,
  Location,
  LocationInput,
  Movement,
  MovementListParams,
  Page,
  ReconcileResult,
  StockLevel,
  StockListParams,
  StockRow,
  TransferInput,
} from './types'

export const inventoryApi = {
  listLocations: () => api.get<Location[]>('/inventory/locations'),
  createLocation: (input: LocationInput) => api.post<Location>('/inventory/locations', input),

  listStock: (params: StockListParams) => api.get<Page<StockRow>>('/inventory/stock', params),
  adjust: (input: AdjustmentInput) => api.post<StockLevel>('/inventory/adjustments', input),
  transfer: (input: TransferInput) => api.post<StockLevel[]>('/inventory/transfers', input),

  listMovements: (params: MovementListParams) =>
    api.get<Page<Movement>>('/inventory/movements', params),
  reconcile: () => api.get<ReconcileResult>('/inventory/reconcile'),
}
