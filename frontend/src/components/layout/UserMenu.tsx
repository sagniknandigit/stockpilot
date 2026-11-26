import { Check, ChevronsUpDown, Keyboard, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useAuth, useSession } from '@/auth/AuthContext'
import { ROLE_LABELS } from '@/auth/roles'
import { Avatar } from '@/components/ui/Avatar'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { cn } from '@/lib/utils'
import { useTheme, type ThemePreference } from '@/providers/ThemeContext'
import { useCommandPalette } from '../command/CommandContext'

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** The user card at the bottom of the sidebar; opens account and theme options. */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useSession()
  const { signOut } = useAuth()
  const { preference, setPreference } = useTheme()
  const palette = useCommandPalette()

  return (
    <Menu
      side="top"
      align="left"
      className="w-60"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="Account menu"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-subtle',
            collapsed && 'justify-center',
          )}
        >
          <Avatar name={user.full_name} brand />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {user.full_name}
                </span>
                <span className="block truncate text-xs text-muted">{ROLE_LABELS[user.role]}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted" aria-hidden="true" />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[13px] font-medium text-foreground">{user.full_name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            Theme
          </p>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <MenuItem
              key={value}
              icon={<Icon />}
              active={preference === value}
              onSelect={() => {
                setPreference(value)
                close()
              }}
            >
              <span className="flex items-center justify-between">
                {label}
                {preference === value && <Check className="text-accent" />}
              </span>
            </MenuItem>
          ))}
          <div className="my-1 border-t" />
          <MenuItem
            icon={<Keyboard />}
            onSelect={() => {
              close()
              palette.open()
            }}
          >
            Command palette
          </MenuItem>
          <MenuItem icon={<LogOut />} onSelect={signOut}>
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
