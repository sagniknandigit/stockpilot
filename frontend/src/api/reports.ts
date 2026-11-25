import { api } from './client'
import type { Summary } from './types'

export const reportsApi = {
  summary: () => api.get<Summary>('/reports/summary'),
}
