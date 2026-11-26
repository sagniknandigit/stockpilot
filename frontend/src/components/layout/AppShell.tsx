import { Menu as MenuIcon, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/Button'
import { readStorage, writeStorage, cn } from '@/lib/utils'
import { LocationProvider } from '@/providers/LocationProvider'
import { LiveIndicator } from '@/realtime/LiveIndicator'
import { RealtimeProvider } from '@/realtime/RealtimeProvider'
import { AssistantButton } from '../assistant/AssistantButton'
import { AssistantProvider } from '../assistant/AssistantProvider'
import { CommandPaletteProvider } from '../command/CommandPalette'
import { Breadcrumbs } from './Breadcrumbs'
import { LocationSwitcher } from './LocationSwitcher'
import { SearchTrigger } from './SearchTrigger'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'

const COLLAPSED_KEY = 'stockpilot.sidebar-collapsed'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => readStorage<boolean>(COLLAPSED_KEY) ?? false)
  const { pathname } = useLocation()
  const reduceMotion = useReducedMotion()

  // Close the mobile drawer with Esc.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  function toggleCollapsed() {
    setCollapsed((value) => {
      writeStorage(COLLAPSED_KEY, !value)
      return !value
    })
  }

  return (
    <LocationProvider>
      <RealtimeProvider>
        <AssistantProvider>
          <CommandPaletteProvider>
            <div
              className={cn(
                'min-h-screen transition-[padding] duration-200',
                collapsed ? 'lg:pl-[72px]' : 'lg:pl-64',
              )}
            >
              {/* Desktop sidebar */}
              <aside
                className={cn(
                  'fixed inset-y-0 left-0 z-30 hidden border-r bg-surface transition-[width] duration-200 lg:block',
                  collapsed ? 'w-[72px]' : 'w-64',
                )}
              >
                <Sidebar id="desktop" collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
              </aside>

              {/* Mobile sidebar */}
              <div
                className={cn('fixed inset-0 z-40 lg:hidden', !mobileOpen && 'pointer-events-none')}
              >
                <div
                  className={cn(
                    'absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity',
                    mobileOpen ? 'opacity-100' : 'opacity-0',
                  )}
                  onClick={() => setMobileOpen(false)}
                  aria-hidden="true"
                />
                <aside
                  className={cn(
                    'absolute inset-y-0 left-0 w-72 border-r bg-surface shadow-pop transition-transform duration-200',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full',
                  )}
                  aria-label="Navigation"
                  inert={!mobileOpen}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-2 z-10 size-8"
                    onClick={() => setMobileOpen(false)}
                    aria-label="Close navigation"
                  >
                    <X />
                  </Button>
                  <Sidebar id="mobile" onNavigate={() => setMobileOpen(false)} />
                </aside>
              </div>

              <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 size-8 lg:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open navigation"
                >
                  <MenuIcon />
                </Button>
                <Breadcrumbs />
                <div className="ml-auto flex items-center gap-2">
                  <LiveIndicator />
                  <SearchTrigger />
                  <AssistantButton />
                  <LocationSwitcher />
                  <ThemeToggle />
                </div>
              </header>

              <motion.main
                key={pathname.split('/')[1] ?? ''}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8"
              >
                <Outlet />
              </motion.main>
            </div>
          </CommandPaletteProvider>
        </AssistantProvider>
      </RealtimeProvider>
    </LocationProvider>
  )
}
