import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useSession, useAuth } from '@/auth/AuthContext'
import { ROLE_LABELS } from '@/auth/roles'
import { Badge } from '@/components/ui/Badge'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { useTheme, type ThemePreference } from '@/providers/ThemeContext'

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu() {
  const { user } = useSession()
  const { signOut } = useAuth()
  const { preference, setPreference } = useTheme()

  return (
    <Menu
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent dark:text-indigo-300"
          aria-label="Account menu"
        >
          {initials(user.full_name)}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[13px] font-medium text-foreground">{user.full_name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <Badge tone="accent" className="mt-2">
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
          <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
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
          <MenuItem icon={<LogOut />} onSelect={signOut}>
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
