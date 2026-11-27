import { AlertTriangle, Bell, BellOff, CheckCheck, Newspaper, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import type { AppNotification } from '@/api/types'
import { Menu } from '@/components/ui/Menu'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

const TYPE_META: Record<string, { icon: LucideIcon; className: string }> = {
  'stock.low': { icon: AlertTriangle, className: 'bg-warning/12 text-warning-ink' },
  digest: { icon: Newspaper, className: 'bg-accent-soft text-accent-soft-foreground' },
}
const FALLBACK = { icon: Bell, className: 'bg-subtle text-muted' }

/** Top-bar bell: unread badge and a popover list. New items arrive over the WebSocket. */
export function NotificationBell() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const navigate = useNavigate()
  const unread = notifications.data?.unread ?? 0

  function open(item: AppNotification, close: () => void) {
    if (!item.read_at) markRead.mutate(item.id)
    close()
    if (item.link) navigate(item.link)
  }

  return (
    <Menu
      // Phones: pin the panel under the top bar, full width, instead of anchoring to the bell.
      className="w-[22rem] p-0 max-sm:fixed max-sm:inset-x-3 max-sm:top-14 max-sm:mt-0 max-sm:w-auto"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-foreground"
        >
          <Bell className="size-4" aria-hidden="true" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key={unread}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-background"
                aria-hidden="true"
              >
                {unread > 9 ? '9+' : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold text-foreground">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <CheckCheck className="size-3.5" aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>
          {notifications.isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !notifications.data?.items.length ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-xl border bg-subtle text-muted">
                <BellOff className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">You’re all caught up</p>
              <p className="mt-0.5 text-xs text-muted">
                Low-stock alerts and daily digests show up here.
              </p>
            </div>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {notifications.data.items.map((item) => {
                const meta = TYPE_META[item.type] ?? FALLBACK
                const Icon = meta.icon
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => open(item, close)}
                      className={cn(
                        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle/70',
                        !item.read_at && 'bg-accent-soft/40',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg',
                          meta.className,
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-[13px] text-foreground',
                            !item.read_at && 'font-semibold',
                          )}
                        >
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                            {item.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted">
                          {formatRelative(item.created_at)}
                        </span>
                      </span>
                      {!item.read_at && (
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Menu>
  )
}
