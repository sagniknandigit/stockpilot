import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface LinkTabsProps {
  tabs: { to: string; label: string; end?: boolean }[]
  label: string
  /** Unique per page so the active underline animates within this set only. */
  id: string
}

/** Route-backed section tabs (e.g. Purchase orders | Suppliers). */
export function LinkTabs({ tabs, label, id }: LinkTabsProps) {
  return (
    <nav aria-label={label} className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'relative px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              isActive ? 'text-foreground' : 'text-muted hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              {tab.label}
              {isActive && (
                <motion.span
                  layoutId={`${id}-underline`}
                  transition={spring}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-gradient"
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
