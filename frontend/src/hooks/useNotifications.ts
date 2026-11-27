import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications'
import type { NotificationList, UUID } from '@/api/types'
import { queryKeys } from './queryKeys'

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: notificationsApi.list,
    // Pushed over the WebSocket; this poll is only a safety net if the socket is down.
    refetchInterval: 120_000,
  })
}

/** Optimistically mark one notification read so the badge updates instantly. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: UUID) => notificationsApi.markRead(id),
    onMutate: (id) => {
      queryClient.setQueryData<NotificationList>(queryKeys.notifications.all, (list) =>
        list
          ? {
              unread: Math.max(
                0,
                list.unread - (list.items.some((n) => n.id === id && !n.read_at) ? 1 : 0),
              ),
              items: list.items.map((n) =>
                n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n,
              ),
            }
          : list,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onMutate: () => {
      const now = new Date().toISOString()
      queryClient.setQueryData<NotificationList>(queryKeys.notifications.all, (list) =>
        list
          ? { unread: 0, items: list.items.map((n) => ({ ...n, read_at: n.read_at ?? now })) }
          : list,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}
