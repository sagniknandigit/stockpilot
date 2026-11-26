import { api } from './client'
import type { Analytics, ReorderSuggestions, UUID, VariantForecast } from './types'

export const insightsApi = {
  reorderSuggestions: (onlyNeeded = true) =>
    api.get<ReorderSuggestions>('/insights/reorder-suggestions', { only_needed: onlyNeeded }),
  forecast: (variantId: UUID) => api.get<VariantForecast>(`/insights/forecast/${variantId}`),
  /** Dates are local calendar days "YYYY-MM-DD" (max 366 days). */
  analytics: (dateFrom: string, dateTo: string) =>
    api.get<Analytics>('/insights/analytics', { date_from: dateFrom, date_to: dateTo }),
}
