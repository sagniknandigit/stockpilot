import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  loading?: boolean
  tone?: 'default' | 'warning'
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone = 'default',
}: KpiCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <Icon
          className={cn('size-4', tone === 'warning' ? 'text-amber-500' : 'text-muted')}
          aria-hidden="true"
        />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}
