import { createContext, useContext, useEffect, useRef } from 'react'
import type { RealtimeEvent, RealtimeStatus } from './events'

export interface RealtimeContextValue {
  status: RealtimeStatus
  subscribe: (listener: (event: RealtimeEvent) => void) => () => void
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext)?.status ?? 'offline'
}

/** Run `handler` for every realtime event (always calls the latest handler). */
export function useRealtimeEvents(handler: (event: RealtimeEvent) => void): void {
  const context = useContext(RealtimeContext)
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => context?.subscribe((event) => handlerRef.current(event)), [context])
}
