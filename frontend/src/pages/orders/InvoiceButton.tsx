import { FileDown } from 'lucide-react'
import { useState } from 'react'
import { salesApi } from '@/api/sales'
import { Button } from '@/components/ui/Button'
import type { ButtonVariant } from '@/components/ui/buttonStyles'
import { toast } from '@/components/ui/toast'
import { openFileIn } from '@/lib/download'
import { getErrorMessage } from '@/lib/errors'

/** Fetches the PDF with the auth header and opens it in a new tab. */
export function InvoiceButton({
  orderId,
  variant = 'secondary',
}: {
  orderId: string
  variant?: ButtonVariant
}) {
  const [loading, setLoading] = useState(false)

  async function open() {
    // Open the tab synchronously (inside the click) so popup blockers allow it, then fill it.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    setLoading(true)
    try {
      openFileIn(tab, await salesApi.invoice(orderId))
    } catch (error) {
      tab?.close()
      toast.error('Couldn’t load the invoice', getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={variant} onClick={open} loading={loading}>
      {!loading && <FileDown />} Download invoice
    </Button>
  )
}
