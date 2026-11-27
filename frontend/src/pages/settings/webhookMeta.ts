import type { DeliveryStatus, WebhookDelivery } from '@/api/types'
import type { BadgeTone } from '@/components/ui/Badge'

export const EVENT_LABELS: Record<string, string> = {
  'order.created': 'Order created',
  'order.refunded': 'Order refunded',
  'stock.changed': 'Stock changed',
  'stock.low': 'Stock low',
  'po.received': 'Purchase order received',
  ping: 'Test ping',
}

const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  succeeded: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}

/** A pending delivery that has already been attempted is being retried with backoff. */
export function deliveryStatus(delivery: WebhookDelivery): { label: string; tone: BadgeTone } {
  if (delivery.status === 'pending' && delivery.attempts > 0)
    return { label: 'Retrying', tone: 'warning' }
  return DELIVERY_STATUS[delivery.status]
}

/** "••••••••3f9a" — enough to recognise a secret without exposing it. */
export function maskSecret(secret: string): string {
  return `${'•'.repeat(12)}${secret.slice(-4)}`
}
