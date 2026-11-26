import type { Urgency } from '@/api/types'
import type { BadgeTone } from '@/components/ui/Badge'

export const URGENCY: Record<Urgency, { label: string; tone: BadgeTone }> = {
  critical: { label: 'Critical', tone: 'danger' },
  warning: { label: 'Soon', tone: 'warning' },
  ok: { label: 'OK', tone: 'success' },
}

/** "today", "tomorrow", "in 5 days", or null when no stockout is forecast. */
export function runsOutLabel(daysUntil: number | null): string | null {
  if (daysUntil === null) return null
  if (daysUntil <= 0) return 'Out now'
  if (daysUntil === 1) return 'Tomorrow'
  return `In ${daysUntil} days`
}

export function formatWape(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}
