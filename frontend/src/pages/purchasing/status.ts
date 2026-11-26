import type { PurchaseOrderStatus } from '@/api/types'
import type { BadgeTone } from '@/components/ui/Badge'

export const PO_STATUS: Record<PurchaseOrderStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  ordered: { label: 'Ordered', tone: 'info' },
  partially_received: { label: 'Partially received', tone: 'warning' },
  received: { label: 'Received', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

export const formatPoNumber = (number: number) => `PO-${number}`
