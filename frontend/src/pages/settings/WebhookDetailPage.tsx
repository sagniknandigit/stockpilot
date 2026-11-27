import { ArrowLeft, ChevronRight, Inbox, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Webhook, WebhookDelivery } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/PageLoader'
import { Pagination } from '@/components/ui/Pagination'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { toast } from '@/components/ui/toast'
import { useWebhookActions, useWebhookDeliveries, useWebhooks } from '@/hooks/useIntegrations'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deliveryStatus, EVENT_LABELS } from './webhookMeta'
import { WebhookSecret } from './WebhookSecret'

export function WebhookDetailPage() {
  const { webhookId } = useParams<{ webhookId: string }>()
  const webhooks = useWebhooks()
  if (webhooks.isPending) return <PageLoader />
  if (webhooks.isError) return <Alert>{getErrorMessage(webhooks.error)}</Alert>
  const webhook = webhooks.data.find((w) => w.id === webhookId)
  if (!webhook) {
    return (
      <EmptyState
        title="Endpoint not found"
        description="It may have been deleted."
        action={
          <Link to="/settings" className="text-accent">
            Back to settings
          </Link>
        }
      />
    )
  }
  return <WebhookDetail webhook={webhook} />
}

function WebhookDetail({ webhook }: { webhook: Webhook }) {
  const navigate = useNavigate()
  const { organization } = useSession()
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null)
  const deliveries = useWebhookDeliveries(webhook.id, page)
  const actions = useWebhookActions(webhook.id)

  return (
    <>
      <Link
        to="/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Integrations
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-mono text-lg font-semibold text-foreground">
              {webhook.url}
            </h1>
            <Badge tone={webhook.is_active ? 'success' : 'neutral'} dot>
              {webhook.is_active ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {webhook.description ?? 'No description'} · {webhook.events.join(', ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="text-danger-ink" onClick={() => setConfirm('delete')}>
            <Trash2 /> Delete
          </Button>
          <Button variant="secondary" onClick={() => setConfirm('rotate')}>
            <RefreshCw /> Rotate secret
          </Button>
          <Button
            loading={actions.test.isPending}
            onClick={() =>
              actions.test.mutate(undefined, {
                onSuccess: () => toast.success('Test event queued'),
              })
            }
          >
            <Send /> Send test event
          </Button>
        </div>
      </div>

      <Card className="mb-6 p-5">
        <p className="mb-2 text-[13px] font-medium text-foreground">Signing secret</p>
        <WebhookSecret secret={webhook.secret} />
      </Card>

      <Card>
        <CardHeader
          title="Deliveries"
          description="Newest first. Failed deliveries are retried with backoff."
        />
        {deliveries.isError ? (
          <Alert className="m-4">{getErrorMessage(deliveries.error)}</Alert>
        ) : deliveries.data?.total === 0 ? (
          <EmptyState
            compact
            icon={Inbox}
            title="No deliveries yet"
            description="Send a test event, or wait for one of the subscribed events to happen."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH className="w-8">
                    <span className="sr-only">Expand</span>
                  </TH>
                  <TH>Event</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Attempts</TH>
                  <TH className="text-right">HTTP</TH>
                  <TH className="text-right">Duration</TH>
                  <TH>When</TH>
                </TR>
              </THead>
              <TBody>
                {deliveries.isPending ? (
                  <TableSkeleton columns={7} rows={4} />
                ) : (
                  deliveries.data.items.map((delivery) => (
                    <Fragment key={delivery.id}>
                      <TR
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === delivery.id ? null : delivery.id)}
                      >
                        <TD>
                          <button
                            type="button"
                            aria-expanded={expanded === delivery.id}
                            aria-label={`Details for ${delivery.event_type} delivery`}
                            className="grid size-6 place-items-center rounded text-muted"
                          >
                            <ChevronRight
                              className={cn(
                                'size-4 transition-transform',
                                expanded === delivery.id && 'rotate-90',
                              )}
                            />
                          </button>
                        </TD>
                        <TD className="min-w-36">
                          <p className="font-mono text-[13px] text-foreground">
                            {delivery.event_type}
                          </p>
                          <p className="text-xs text-muted">
                            {EVENT_LABELS[delivery.event_type] ?? ''}
                          </p>
                        </TD>
                        <TD>
                          <Badge tone={deliveryStatus(delivery).tone} dot>
                            {deliveryStatus(delivery).label}
                          </Badge>
                        </TD>
                        <TD className="text-right">{delivery.attempts}</TD>
                        <TD
                          className={cn(
                            'text-right font-mono',
                            (delivery.response_status ?? 0) >= 400 && 'text-danger-ink',
                          )}
                        >
                          {delivery.response_status ?? '—'}
                        </TD>
                        <TD className="text-right whitespace-nowrap text-muted">
                          {delivery.duration_ms === null ? '—' : `${delivery.duration_ms} ms`}
                        </TD>
                        <TD
                          className="whitespace-nowrap text-muted"
                          title={formatDateTime(delivery.created_at, organization.timezone)}
                        >
                          {formatRelative(delivery.created_at)}
                        </TD>
                      </TR>
                      {expanded === delivery.id && (
                        <tr>
                          <td colSpan={7} className="border-b bg-subtle/40 px-5 py-4">
                            <DeliveryDetails
                              delivery={delivery}
                              timeZone={organization.timezone}
                              onRedeliver={() =>
                                actions.redeliver.mutate(delivery.id, {
                                  onSuccess: () => toast.success('Redelivery queued'),
                                })
                              }
                              redelivering={actions.redeliver.isPending}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </TBody>
            </Table>
            {deliveries.data && (
              <Pagination
                page={page}
                size={20}
                total={deliveries.data.total}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirm === 'rotate'}
        onClose={() => setConfirm(null)}
        title="Rotate signing secret?"
        description="A new secret is generated now. Update your receiver, or it will reject the next deliveries."
        confirmLabel="Rotate secret"
        loading={actions.rotate.isPending}
        onConfirm={() =>
          actions.rotate.mutate(undefined, {
            onSuccess: () => {
              toast.success('Secret rotated')
              setConfirm(null)
            },
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete this endpoint?"
        description="StockPilot stops sending events to it. Its delivery history is removed."
        confirmLabel="Delete endpoint"
        destructive
        loading={actions.remove.isPending}
        onConfirm={() =>
          actions.remove.mutate(undefined, {
            onSuccess: () => {
              toast.success('Endpoint deleted')
              navigate('/settings')
            },
          })
        }
      />
    </>
  )
}

function DeliveryDetails({
  delivery,
  timeZone,
  onRedeliver,
  redelivering,
}: {
  delivery: WebhookDelivery
  timeZone: string
  onRedeliver: () => void
  redelivering: boolean
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CodeBlock
        label="Payload"
        code={JSON.stringify(delivery.payload, null, 2)}
        className="max-h-72 overflow-y-auto"
      />
      <div className="space-y-3 text-[13px]">
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-xs text-muted">Delivered</dt>
            <dd className="text-foreground">
              {delivery.delivered_at ? formatDateTime(delivery.delivered_at, timeZone) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Next attempt</dt>
            <dd className="text-foreground">
              {delivery.next_attempt_at ? formatDateTime(delivery.next_attempt_at, timeZone) : '—'}
            </dd>
          </div>
        </dl>
        {delivery.error && <Alert>{delivery.error}</Alert>}
        {delivery.response_body && (
          <CodeBlock label="Response body" code={delivery.response_body} />
        )}
        {!delivery.error && !delivery.response_body && delivery.status === 'pending' && (
          <p className="text-muted">Waiting for the delivery worker to send it.</p>
        )}
        <Button variant="secondary" size="sm" onClick={onRedeliver} loading={redelivering}>
          <RotateCcw /> Redeliver
        </Button>
      </div>
    </div>
  )
}
