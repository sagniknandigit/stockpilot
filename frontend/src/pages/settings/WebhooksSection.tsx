import { ArrowRight, Plus, Send, Webhook as WebhookIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Webhook } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/toast'
import { useUpdateWebhook, useWebhookActions, useWebhooks } from '@/hooks/useIntegrations'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { SignatureHelp } from './SignatureHelp'
import { WebhookDialog } from './WebhookDialog'
import { WebhookSecret } from './WebhookSecret'

export function WebhooksSection() {
  const webhooks = useWebhooks()
  const [editing, setEditing] = useState<{ webhook: Webhook | null } | null>(null)

  return (
    <section aria-labelledby="webhooks-title" className="space-y-4">
      <Card>
        <CardHeader
          icon={<WebhookIcon />}
          title={<span id="webhooks-title">Webhooks</span>}
          description="Get notified in real time when orders, stock and deliveries change."
          actions={
            <Button size="sm" onClick={() => setEditing({ webhook: null })}>
              <Plus /> Add endpoint
            </Button>
          }
        />
        <div className="px-5 pb-5">
          {webhooks.isError ? (
            <Alert>{getErrorMessage(webhooks.error)}</Alert>
          ) : webhooks.isPending ? (
            <Skeleton className="h-36 w-full rounded-xl" />
          ) : webhooks.data.length === 0 ? (
            <EmptyState
              compact
              icon={WebhookIcon}
              title="No endpoints yet"
              description="Add a URL and StockPilot will POST signed events to it."
            />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {webhooks.data.map((webhook) => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  onEdit={() => setEditing({ webhook })}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>
      <SignatureHelp />
      <WebhookDialog
        open={editing !== null}
        webhook={editing?.webhook ?? null}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}

function WebhookCard({ webhook, onEdit }: { webhook: Webhook; onEdit: () => void }) {
  const { organization } = useSession()
  const update = useUpdateWebhook()
  const { test } = useWebhookActions(webhook.id)

  return (
    <li className="flex min-w-0 flex-col rounded-xl border bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-mono text-[13px] font-medium text-foreground"
            title={webhook.url}
          >
            {webhook.url}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {webhook.description ?? 'No description'} · added{' '}
            {formatDate(webhook.created_at, organization.timezone)}
          </p>
        </div>
        <Switch
          label={webhook.is_active ? 'Active' : 'Paused'}
          checked={webhook.is_active}
          disabled={update.isPending}
          onChange={(is_active) =>
            update.mutate(
              { id: webhook.id, input: { is_active } },
              {
                onSuccess: () => toast.success(is_active ? 'Endpoint resumed' : 'Endpoint paused'),
              },
            )
          }
        />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Subscribed events">
        {webhook.events.map((event) => (
          <li
            key={event}
            className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] text-accent-soft-foreground"
          >
            {event}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <WebhookSecret secret={webhook.secret} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          variant="secondary"
          size="sm"
          loading={test.isPending}
          onClick={() =>
            test.mutate(undefined, {
              onSuccess: () =>
                toast.success('Test event queued', 'A “ping” delivery is on its way.'),
            })
          }
        >
          <Send /> Send test event
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Link
          to={`/settings/webhooks/${webhook.id}`}
          className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          aria-label={`Deliveries for ${webhook.url}`}
        >
          Deliveries <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  )
}
