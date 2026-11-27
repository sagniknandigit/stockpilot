import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { API_BASE_URL, refreshAccessToken } from '@/api/client'
import { tokenStore } from '@/api/tokenStore'
import type { VariantSearchResult } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { toast } from '@/components/ui/toast'
import { queryKeys } from '@/hooks/queryKeys'
import { formatMoney, formatOrderNumber } from '@/lib/format'
import { isLocalOrder, type RealtimeEvent, type RealtimeStatus } from './events'
import { RealtimeContext } from './RealtimeContext'

const CLOSE_UNAUTHORIZED = 4401
const MAX_BACKOFF_MS = 30_000
/** Coalesce bursts (a 10-line sale emits 10 stock events) into one refetch. */
const INVALIDATE_DEBOUNCE_MS = 300

function socketUrl(): string {
  const base = API_BASE_URL.startsWith('http')
    ? API_BASE_URL.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${API_BASE_URL}`
  return `${base}/ws`
}

/**
 * One WebSocket per signed-in tab. Authenticates in-band, reconnects with exponential backoff,
 * and turns server events into cache updates so every open page stays current.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { organization } = useSession()
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const listeners = useRef(new Set<(event: RealtimeEvent) => void>())

  useEffect(() => {
    let socket: WebSocket | null = null
    let attempt = 0
    let reconnectTimer = 0
    let disposed = false
    const pending = new Set<string>()
    const pendingKeys = new Map<string, QueryKey>()
    let flushTimer = 0
    let authedWith: string | undefined

    const invalidate = (...keys: QueryKey[]) => {
      keys.forEach((key) => {
        const id = JSON.stringify(key)
        pending.add(id)
        pendingKeys.set(id, key)
      })
      window.clearTimeout(flushTimer)
      flushTimer = window.setTimeout(() => {
        pending.forEach(
          (id) => void queryClient.invalidateQueries({ queryKey: pendingKeys.get(id) }),
        )
        pending.clear()
      }, INVALIDATE_DEBOUNCE_MS)
    }

    const handle = (event: RealtimeEvent) => {
      switch (event.type) {
        case 'ready':
          attempt = 0
          setStatus('live')
          break
        case 'stock.changed':
          // Update POS search results right away so availability is never stale at the till.
          queryClient
            .getQueriesData<VariantSearchResult[]>({
              queryKey: queryKeys.catalog.variantSearches(),
            })
            .forEach(([key, data]) => {
              if (!data || key[3] !== event.location_id) return
              queryClient.setQueryData<VariantSearchResult[]>(
                key,
                data.map((item) =>
                  item.id === event.variant_id ? { ...item, available: event.available } : item,
                ),
              )
            })
          invalidate(
            queryKeys.inventory.all,
            queryKeys.reports.all,
            queryKeys.insights.all,
            queryKeys.catalog.variantSearches(),
          )
          break
        case 'order.created':
          invalidate(queryKeys.sales.all, queryKeys.reports.all)
          // Toast sales made elsewhere (another till / tab); our own arrive with a receipt.
          window.setTimeout(() => {
            if (!isLocalOrder(event.order_id)) {
              toast.info(
                `New sale ${formatOrderNumber(event.number)}`,
                formatMoney(event.total, organization.currency),
              )
            }
          }, 1500)
          break
        case 'order.refunded':
          invalidate(
            queryKeys.sales.all,
            queryKeys.reports.all,
            queryKeys.inventory.all,
            queryKeys.insights.all,
          )
          break
        case 'notification.created':
          invalidate(queryKeys.notifications.all)
          toast.info(event.title)
          break
        case 'po.received':
          invalidate(
            queryKeys.purchasing.all,
            queryKeys.inventory.all,
            queryKeys.insights.all,
            queryKeys.reports.all,
          )
          break
        case 'resync':
          void queryClient.invalidateQueries()
          break
        case 'ping':
          socket?.send(JSON.stringify({ type: 'pong' }))
          break
      }
      listeners.current.forEach((listener) => listener(event))
    }

    const scheduleReconnect = () => {
      if (disposed) return
      setStatus('reconnecting')
      // 1s, 2s, 4s … capped, with jitter so many tabs don't reconnect in lockstep.
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5)
      attempt += 1
      reconnectTimer = window.setTimeout(connect, delay)
    }

    function connect() {
      const token = tokenStore.get()?.accessToken
      if (disposed || !token) return
      socket = new WebSocket(socketUrl())
      socket.onopen = () => {
        authedWith = tokenStore.get()?.accessToken ?? token
        socket?.send(JSON.stringify({ type: 'auth', token: authedWith }))
      }
      socket.onmessage = (message) => {
        try {
          handle(JSON.parse(String(message.data)) as RealtimeEvent)
        } catch {
          // Ignore malformed frames.
        }
      }
      socket.onclose = (close) => {
        socket = null
        if (disposed) return
        if (close.code === CLOSE_UNAUTHORIZED) {
          // If an HTTP request already rotated the token, just retry with the new one;
          // otherwise refresh once (shared with any in-flight refresh), or stop if signed out.
          const current = tokenStore.get()?.accessToken
          if (current && current !== authedWith) {
            attempt = 0
            connect()
            return
          }
          void refreshAccessToken().then((fresh) =>
            fresh ? scheduleReconnect() : setStatus('offline'),
          )
          return
        }
        scheduleReconnect()
      }
    }

    // Reconnect promptly when the network or tab comes back instead of waiting out the backoff.
    const wake = () => {
      if (!socket && !disposed) {
        window.clearTimeout(reconnectTimer)
        attempt = 0
        connect()
      }
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    connect()

    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(flushTimer)
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      socket?.close()
    }
  }, [queryClient, organization.currency])

  const value = useMemo(
    () => ({
      status,
      subscribe: (listener: (event: RealtimeEvent) => void) => {
        listeners.current.add(listener)
        return () => {
          listeners.current.delete(listener)
        }
      },
    }),
    [status],
  )

  return <RealtimeContext value={value}>{children}</RealtimeContext>
}
