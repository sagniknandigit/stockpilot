import { useState } from 'react'
import type { Webhook } from '@/api/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useCreateWebhook, useUpdateWebhook, useWebhookEventTypes } from '@/hooks/useIntegrations'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { EVENT_LABELS } from './webhookMeta'

interface WebhookDialogProps {
  open: boolean
  webhook: Webhook | null
  onClose: () => void
}

export function WebhookDialog({ open, webhook, onClose }: WebhookDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={webhook ? 'Edit endpoint' : 'Add webhook endpoint'}
      description="StockPilot POSTs a signed JSON payload to this URL when the selected events happen."
    >
      <WebhookForm webhook={webhook} onDone={onClose} />
    </Dialog>
  )
}

function WebhookForm({ webhook, onDone }: { webhook: Webhook | null; onDone: () => void }) {
  const eventTypes = useWebhookEventTypes()
  const create = useCreateWebhook()
  const update = useUpdateWebhook()
  const [url, setUrl] = useState(webhook?.url ?? '')
  const [description, setDescription] = useState(webhook?.description ?? '')
  const [events, setEvents] = useState<Set<string>>(
    () => new Set(webhook?.events ?? ['order.created']),
  )
  const [touched, setTouched] = useState(false)

  const urlError = !url.trim()
    ? 'Enter the URL to deliver to'
    : !/^https?:\/\/[^\s]+$/i.test(url.trim())
      ? 'Enter a full URL, e.g. https://example.com/hooks/stockpilot'
      : undefined
  const eventsError = events.size === 0 ? 'Choose at least one event' : undefined
  const serverError = create.error ?? update.error

  function toggle(event: string) {
    setEvents((current) => {
      const next = new Set(current)
      if (next.has(event)) next.delete(event)
      else next.add(event)
      return next
    })
  }

  function submit() {
    setTouched(true)
    if (urlError || eventsError) return
    const input = { url: url.trim(), description: description.trim() || null, events: [...events] }
    const onSuccess = () => {
      toast.success(
        webhook ? 'Endpoint updated' : 'Endpoint added',
        'Use “Send test event” to check it’s reachable.',
      )
      onDone()
    }
    if (webhook) update.mutate({ id: webhook.id, input }, { onSuccess })
    else create.mutate(input, { onSuccess })
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Field
        label="Endpoint URL"
        error={touched ? urlError : undefined}
        hint="Must be https:// and publicly reachable in production."
      >
        {(props) => (
          <Input
            {...props}
            autoFocus
            type="url"
            value={url}
            placeholder="https://example.com/hooks/stockpilot"
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
      </Field>
      <Field label="Description">
        {(props) => (
          <Input
            {...props}
            value={description}
            maxLength={200}
            placeholder="Optional"
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-foreground">Events</legend>
        <div className="flex flex-wrap gap-2">
          {(eventTypes.data ?? []).map((event) => {
            const on = events.has(event)
            return (
              <button
                key={event}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(event)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  on
                    ? 'border-accent/40 bg-accent-soft text-accent-soft-foreground'
                    : 'bg-surface text-muted hover:text-foreground',
                )}
              >
                <span className="font-mono">{event}</span>
                <span className="sr-only"> ({EVENT_LABELS[event] ?? event})</span>
              </button>
            )
          })}
        </div>
        {touched && eventsError && <p className="mt-1.5 text-xs text-danger-ink">{eventsError}</p>}
      </fieldset>
      {serverError && <Alert>{getErrorMessage(serverError)}</Alert>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {webhook ? 'Save changes' : 'Add endpoint'}
        </Button>
      </div>
    </form>
  )
}
