import { Download } from 'lucide-react'
import { useState } from 'react'
import { catalogApi } from '@/api/catalog'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toast'
import { saveFile } from '@/lib/download'
import { getErrorMessage } from '@/lib/errors'

export function ExportButton() {
  const [loading, setLoading] = useState(false)
  return (
    <Button
      variant="secondary"
      loading={loading}
      onClick={async () => {
        setLoading(true)
        try {
          saveFile(await catalogApi.exportProducts(), 'stockpilot-products.csv')
        } catch (error) {
          toast.error('Export failed', getErrorMessage(error))
        } finally {
          setLoading(false)
        }
      }}
    >
      {!loading && <Download />} Export CSV
    </Button>
  )
}
