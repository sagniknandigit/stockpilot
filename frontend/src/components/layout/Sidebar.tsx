import { NavLink } from 'react-router'
import { useAuth } from '@/auth/AuthContext'
import { can } from '@/auth/roles'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { NAV_ITEMS } from './navigation'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, organization } = useAuth()
  const items = NAV_ITEMS.filter((item) => !item.minimumRole || can(user?.role, item.minimumRole))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3" aria-label="Main">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-subtle text-foreground'
                  : 'text-muted hover:bg-subtle/70 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-4', isActive && 'text-accent')} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {organization && (
        <div className="m-3 rounded-lg border px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Organization</p>
          <p className="truncate text-[13px] font-medium text-foreground">{organization.name}</p>
          <p className="text-xs text-muted">Currency: {organization.currency}</p>
        </div>
      )}
    </div>
  )
}
