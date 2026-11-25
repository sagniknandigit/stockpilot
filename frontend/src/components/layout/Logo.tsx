import { Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground shadow-sm">
        <Boxes className="size-4.5" aria-hidden="true" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">StockPilot</span>
    </div>
  )
}
