import type { BadgeTone } from '@/components/ui/Badge'
import type { MovementReason } from '@/api/types'

export const REASON_META: Record<MovementReason, { label: string; tone: BadgeTone }> = {
  initial: { label: 'Initial', tone: 'info' },
  adjustment: { label: 'Adjustment', tone: 'neutral' },
  damage: { label: 'Damage', tone: 'danger' },
  purchase_receipt: { label: 'Received', tone: 'success' },
  sale: { label: 'Sale', tone: 'accent' },
  return: { label: 'Return', tone: 'warning' },
  transfer_in: { label: 'Transfer in', tone: 'success' },
  transfer_out: { label: 'Transfer out', tone: 'warning' },
}
