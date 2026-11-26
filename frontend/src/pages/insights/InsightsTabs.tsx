import { useCan } from '@/auth/AuthContext'
import { LinkTabs } from '@/components/ui/LinkTabs'

export function InsightsTabs() {
  const canSeeAnalytics = useCan('manager')
  return (
    <LinkTabs
      id="insights"
      label="Insights sections"
      tabs={[
        { to: '/insights', label: 'Reorder planner', end: true },
        ...(canSeeAnalytics ? [{ to: '/insights/analytics', label: 'Analytics' }] : []),
      ]}
    />
  )
}
