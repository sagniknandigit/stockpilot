import { Search } from 'lucide-react'
import { Kbd } from '@/components/ui/Kbd'
import { modKey } from '@/lib/utils'
import { useCommandPalette } from '../command/CommandContext'

export function SearchTrigger() {
  const { open } = useCommandPalette()
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="hidden h-8 w-56 items-center gap-2 rounded-lg border bg-surface px-2.5 text-[13px] text-muted shadow-card transition-colors hover:border-border-strong hover:text-foreground md:flex"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>{modKey}K</Kbd>
      </button>
      <button
        type="button"
        onClick={open}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-foreground md:hidden"
        aria-label="Search"
      >
        <Search className="size-4" />
      </button>
    </>
  )
}
