import { ArrowRight, CheckCircle2, Lightbulb } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { useSession } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useReorderSuggestions } from '@/hooks/useInsights'
import { daysBetween, todayIn } from '@/lib/format'
import { fadeUp } from '@/lib/motion'
import { runsOutLabel, URGENCY } from '@/pages/insights/urgency'

const URGENCY_ORDER = { critical: 0, warning: 1, ok: 2 }

/** The most urgent reorder suggestions, linking to the planner. */
export function NeedsReorderCard() {
  const { organization } = useSession()
  const suggestions = useReorderSuggestions()
  const today = todayIn(organization.timezone)
  const items = [...(suggestions.data?.items ?? [])]
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        (a.days_of_cover ?? 999) - (b.days_of_cover ?? 999),
    )
    .slice(0, 5)

  return (
    <motion.div variants={fadeUp} className="h-full min-w-0">
      <Card className="flex h-full flex-col">
        <CardHeader
          icon={<Lightbulb />}
          title="Needs reordering"
          description="Forecast to run out before a delivery could arrive"
          actions={
            <Link
              to="/insights"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
            >
              Planner <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
        {suggestions.isPending ? (
          <div className="space-y-3 px-5 pb-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={CheckCircle2}
            title="You’re covered"
            description="No products need reordering right now."
          />
        ) : (
          <ul className="divide-y px-5 pb-2">
            {items.map((item) => {
              const runsOut = item.stockout_date ? daysBetween(today, item.stockout_date) : null
              return (
                <li key={item.variant_id} className="flex items-center gap-3 py-2.5">
                  <Badge tone={URGENCY[item.urgency].tone} dot className="w-20 justify-center">
                    {URGENCY[item.urgency].label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {item.product_name}
                      {item.variant_name !== 'Default' && (
                        <span className="font-normal text-muted"> · {item.variant_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {item.available} left · {item.avg_daily_demand.toFixed(1)}/day
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-foreground">{runsOutLabel(runsOut) ?? '—'}</p>
                    <p className="text-muted">order {item.suggested_qty}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </motion.div>
  )
}
