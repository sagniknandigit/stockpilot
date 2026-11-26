import { cn } from '@/lib/utils'
import { useRealtimeStatus } from './RealtimeContext'

const LABELS = {
  live: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
} as const

/** Pulsing dot showing whether realtime updates are flowing. */
export function LiveIndicator() {
  const status = useRealtimeStatus()
  const live = status === 'live'
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border bg-surface px-2 py-1 text-xs font-medium text-muted sm:inline-flex"
      role="status"
      title={live ? 'Live: changes from other tills appear instantly' : `${LABELS[status]}…`}
    >
      <span className="relative flex size-2" aria-hidden="true">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            live ? 'bg-success' : status === 'offline' ? 'bg-muted' : 'bg-warning',
          )}
        />
      </span>
      {LABELS[status]}
    </span>
  )
}
