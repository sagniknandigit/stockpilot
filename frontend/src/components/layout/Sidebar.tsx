import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { useSession } from '@/auth/AuthContext'
import { can } from '@/auth/roles'
import { Avatar } from '@/components/ui/Avatar'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { NAV_GROUPS, type NavItem } from './navigation'
import { UserMenu } from './UserMenu'

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
  /** Distinguishes the desktop and mobile instances (for the shared active-pill animation). */
  id: string
}

export function Sidebar({ collapsed = false, onToggleCollapsed, onNavigate, id }: SidebarProps) {
  const { user, organization } = useSession()
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.minimumRole || can(user.role, item.minimumRole)),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <Logo collapsed={collapsed} />
        {onToggleCollapsed && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-foreground"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {/* Organization card */}
      <div className={cn('px-3 pb-2', collapsed && 'px-2')}>
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl border bg-subtle/50 p-2',
            collapsed && 'justify-center border-transparent bg-transparent p-0',
          )}
          title={collapsed ? organization.name : undefined}
        >
          <Avatar name={organization.name} square size={collapsed ? 'md' : 'md'} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-foreground">
                {organization.name}
              </p>
              <p className="truncate text-xs text-muted">
                {organization.currency} ·{' '}
                {organization.timezone?.split('/').pop()?.replace('_', ' ')}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav
        className={cn('flex-1 space-y-4 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}
        aria-label="Main"
      >
        {groups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-2 mb-2 border-t first:hidden" aria-hidden="true" />
            ) : (
              <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-muted/80 uppercase">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink
                    item={item}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                    pillId={`${id}-pill`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('shrink-0 border-t p-2', collapsed && 'space-y-1')}>
        {onToggleCollapsed && collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="mx-auto grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-foreground"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  )
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
  pillId,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
  pillId: string
}) {
  const Icon = item.icon
  const base = cn(
    'relative flex items-center gap-3 rounded-lg text-[13px] font-medium transition-colors',
    collapsed ? 'size-10 justify-center' : 'px-3 py-2',
  )

  if (item.comingSoon) {
    return (
      <span
        className={cn(base, 'cursor-not-allowed text-muted/60')}
        aria-disabled="true"
        title={`${item.label} — coming soon`}
      >
        <Icon className="size-4" aria-hidden="true" />
        {collapsed ? (
          <span className="sr-only">{item.label} (coming soon)</span>
        ) : (
          <>
            <span className="flex-1">{item.label}</span>
            <span className="rounded-full border border-dashed px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
              Soon
            </span>
          </>
        )}
      </span>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          base,
          isActive ? 'text-foreground' : 'text-muted hover:bg-subtle/70 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={pillId}
              transition={spring}
              className="absolute inset-0 rounded-lg border bg-surface shadow-card"
              aria-hidden="true"
            >
              <span className="absolute top-1/2 -left-px h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand-gradient" />
            </motion.span>
          )}
          <Icon className={cn('relative size-4', isActive && 'text-accent')} aria-hidden="true" />
          {collapsed ? (
            <span className="sr-only">{item.label}</span>
          ) : (
            <span className="relative">{item.label}</span>
          )}
        </>
      )}
    </NavLink>
  )
}
