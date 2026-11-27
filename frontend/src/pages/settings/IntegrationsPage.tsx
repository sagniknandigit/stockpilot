import { PageHeader } from '@/components/ui/PageHeader'
import { ApiKeysSection } from './ApiKeysSection'
import { WebhooksSection } from './WebhooksSection'

/** Settings → Integrations (owner only). */
export function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Connect StockPilot to your other tools with API keys and webhooks."
      />
      <div className="space-y-8">
        <ApiKeysSection />
        <WebhooksSection />
      </div>
    </>
  )
}
