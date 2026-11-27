import { api } from './client'
import type { NotificationList, UUID } from './types'

export const notificationsApi = {
  list: () => api.get<NotificationList>('/notifications'),
  markRead: (id: UUID) => api.post<void>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/notifications/read-all'),
}
