import {
  ArrowRight,
  CornerDownLeft,
  LogOut,
  Moon,
  Package,
  PackagePlus,
  Search,
  ShoppingCart,
  Sparkles,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAuth, useSession } from '@/auth/AuthContext'
import { can } from '@/auth/roles'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/Spinner'
import { useProducts } from '@/hooks/useCatalog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeContext'
import { useAssistant } from '../assistant/AssistantContext'
import { NAV_ITEMS } from '../layout/navigation'
import { CommandPaletteContext } from './CommandContext'

interface Command {
  id: string
  group: 'Products' | 'Actions' | 'Pages'
  label: string
  hint?: string
  icon: LucideIcon
  keywords?: string
  run: () => void
}

/** Provides ⌘K / Ctrl+K anywhere inside the app shell. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo(() => ({ open: () => setOpen(true) }), [])

  return (
    <CommandPaletteContext value={value}>
      {children}
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </CommandPaletteContext>
  )
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const listId = useId()
  const navigate = useNavigate()
  const { user } = useSession()
  const { signOut } = useAuth()
  const { resolved, setPreference } = useTheme()
  const reduceMotion = useReducedMotion()
  const assistant = useAssistant()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const term = useDebouncedValue(query.trim(), 150)
  const products = useProducts({ q: term, size: 5 }, term.length >= 2)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to)
    const isManager = can(user.role, 'manager')
    const asked = query.trim()
    // Asking the assistant is the fallback, so it is listed after specific matches.
    const askCommand: Command = {
      id: 'ask',
      group: 'Actions',
      label: asked.length >= 3 ? `Ask StockPilot: “${asked}”` : 'Ask StockPilot…',
      icon: Sparkles,
      keywords: `ai assistant question chat ${asked}`,
      run: () => assistant.open(asked.length >= 3 ? asked : undefined),
    }
    const actions: Command[] = [
      {
        id: 'new-sale',
        group: 'Actions',
        label: 'New sale',
        icon: ShoppingCart,
        keywords: 'pos checkout sell till',
        run: go('/pos'),
      },
      ...(isManager
        ? [
            {
              id: 'new-product',
              group: 'Actions' as const,
              label: 'New product',
              icon: PackagePlus,
              keywords: 'create add catalog',
              run: go('/products?new=1'),
            },
            {
              id: 'adjust',
              group: 'Actions' as const,
              label: 'Adjust stock',
              icon: SlidersHorizontal,
              keywords: 'inventory count receive',
              run: go('/inventory'),
            },
          ]
        : []),
      {
        id: 'theme',
        group: 'Actions',
        label: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`,
        icon: resolved === 'dark' ? Sun : Moon,
        keywords: 'theme dark light appearance toggle',
        run: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'sign-out',
        group: 'Actions',
        label: 'Sign out',
        icon: LogOut,
        keywords: 'logout',
        run: signOut,
      },
    ]
    const pages: Command[] = NAV_ITEMS.filter(
      (item) => !item.comingSoon && (!item.minimumRole || can(user.role, item.minimumRole)),
    ).map((item) => ({
      id: `page-${item.to}`,
      group: 'Pages',
      label: item.label,
      icon: item.icon,
      keywords: 'go to open',
      run: go(item.to),
    }))
    const needle = query.trim().toLowerCase()
    const matches = (c: Command) =>
      !needle || `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(needle)
    const productCommands: Command[] =
      term.length >= 2
        ? (products.data?.items ?? []).map((product) => ({
            id: `product-${product.id}`,
            group: 'Products',
            label: product.name,
            hint: product.variants.map((v) => v.sku).join(', '),
            icon: Package,
            run: go(`/products/${product.id}`),
          }))
        : []
    return [...productCommands, ...actions.filter(matches), ...pages.filter(matches), askCommand]
  }, [navigate, user.role, resolved, setPreference, signOut, query, term, products.data, assistant])

  const activeIndex = Math.min(active, Math.max(commands.length - 1, 0))

  function run(command: Command | undefined) {
    if (!command) return
    onClose()
    command.run()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + delta + commands.length) % Math.max(commands.length, 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(commands[activeIndex])
    }
  }

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listId])

  let lastGroup = ''
  return (
    <motion.dialog
      ref={ref}
      aria-label="Command palette"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border bg-surface-raised text-foreground shadow-pop backdrop:bg-black/45 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search products, pages and actions…"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={commands.length ? `${listId}-${activeIndex}` : undefined}
          aria-label="Search commands"
          className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        {products.isFetching && <Spinner className="size-4 text-muted" />}
        <Kbd>Esc</Kbd>
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Results"
        className="max-h-[min(60vh,420px)] overflow-y-auto p-2"
      >
        {commands.length === 0 && (
          <li className="px-3 py-10 text-center text-[13px] text-muted">
            No results for “{query}”
          </li>
        )}
        {commands.map((command, index) => {
          const header = command.group !== lastGroup ? command.group : null
          lastGroup = command.group
          const Icon = command.icon
          const selected = index === activeIndex
          return (
            <li key={command.id} role="presentation">
              {header && (
                <p
                  className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase"
                  aria-hidden="true"
                >
                  {header}
                </p>
              )}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]',
                  selected ? 'bg-accent-soft text-foreground' : 'text-foreground/90',
                )}
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-md border bg-surface',
                    selected && 'border-accent/30 text-accent',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{command.label}</span>
                  {command.hint && (
                    <span className="block truncate text-xs text-muted">{command.hint}</span>
                  )}
                </span>
                {selected &&
                  (command.group === 'Pages' ? (
                    <ArrowRight className="size-4 text-muted" aria-hidden="true" />
                  ) : (
                    <CornerDownLeft className="size-4 text-muted" aria-hidden="true" />
                  ))}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-4 border-t bg-subtle/50 px-4 py-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> select
        </span>
      </div>
    </motion.dialog>
  )
}
