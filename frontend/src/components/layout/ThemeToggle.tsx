import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useTheme } from '@/providers/ThemeContext'

export function ThemeToggle() {
  const { resolved, setPreference } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {resolved === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
