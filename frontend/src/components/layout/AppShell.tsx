import { Menu as MenuIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useSession } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { LocationProvider } from '@/providers/LocationProvider'
import { LocationSwitcher } from './LocationSwitcher'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'

export function AppShell() {
  const { organization } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()

  // Close the mobile drawer with Esc.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <LocationProvider>
      <div className="min-h-screen lg:pl-60">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-surface lg:block">
          <Sidebar />
        </aside>

        {/* Mobile sidebar */}
        <div className={cn('fixed inset-0 z-40 lg:hidden', !mobileOpen && 'pointer-events-none')}>
          <div
            className={cn(
              'absolute inset-0 bg-black/40 transition-opacity',
              mobileOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={cn(
              'absolute inset-y-0 left-0 w-64 border-r bg-surface shadow-xl transition-transform',
              mobileOpen ? 'translate-x-0' : '-translate-x-full',
            )}
            aria-label="Navigation"
            inert={!mobileOpen}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2.5 right-2 size-8"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </Button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>

        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 size-8 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </Button>
          <p className="hidden min-w-0 truncate text-[13px] font-medium text-foreground sm:block">
            {organization.name}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <LocationSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main
          key={pathname.split('/')[1]}
          className="mx-auto w-full max-w-7xl animate-fade-in px-4 py-6 sm:px-6 lg:py-8"
        >
          <Outlet />
        </main>
      </div>
    </LocationProvider>
  )
}
