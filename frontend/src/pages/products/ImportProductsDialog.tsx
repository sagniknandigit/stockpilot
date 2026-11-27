import { CheckCircle2, Download, FileSpreadsheet, Info, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import type { ImportReport } from '@/api/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'
import { useImportProducts } from '@/hooks/useCatalog'
import { saveFile } from '@/lib/download'
import { getErrorMessage, isApiError } from '@/lib/errors'
import { formatNumber, pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'

const TEMPLATE = `sku,product_name,variant_name,category,barcode,price,cost,reorder_point
TEA-GRN-25,Green Tea (25 bags),Default,Beverages,8901234567890,180.00,95.00,10
TEE-S,Cotton T-Shirt,Small,Apparel,,199.50,120.00,5
`
const MAX_BYTES = 2 * 1024 * 1024

export function ImportProductsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Import products from CSV"
      description="Create new products and update existing ones, matched by SKU. Nothing changes until you apply."
    >
      <ImportBody onDone={onClose} />
    </Dialog>
  )
}

function ImportBody({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<ImportReport | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const importer = useImportProducts()

  function choose(next: File | undefined) {
    setPreview(null)
    importer.reset()
    if (!next) return
    if (!/\.csv$/i.test(next.name)) return setLocalError('Choose a .csv file.')
    if (next.size > MAX_BYTES) return setLocalError('The file is larger than 2 MB.')
    setLocalError(null)
    setFile(next)
    // Validate straight away: the dry run reports every problem without saving anything.
    importer.mutate({ file: next, dryRun: true }, { onSuccess: setPreview })
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files[0])
  }

  function apply() {
    if (!file) return
    importer.mutate(
      { file, dryRun: false },
      {
        onSuccess: (report) => {
          toast.success(
            'Import complete',
            `${pluralize(report.created, 'product variant')} created, ${formatNumber(report.updated)} updated`,
          )
          onDone()
        },
      },
    )
  }

  const missingColumns =
    isApiError(importer.error) && (importer.error.details as { missing?: string[] } | null)?.missing
  const canApply = preview !== null && preview.errors.length === 0 && preview.rows > 0

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft/50' : 'border-border-strong bg-subtle/30',
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
          {file ? (
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          ) : (
            <Upload className="size-5" aria-hidden="true" />
          )}
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">
          {file ? file.name : 'Drop a CSV file here'}
        </p>
        <p className="mt-0.5 text-xs text-muted">UTF-8, up to 2 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose CSV file"
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => inputRef.current?.click()}
        >
          {file ? 'Choose another file' : 'Choose file'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Info className="size-3.5" aria-hidden="true" /> Stock levels aren’t imported: record
          stock with adjustments so the ledger stays accurate.
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            saveFile(
              { blob: new Blob([TEMPLATE], { type: 'text/csv' }), filename: null },
              'stockpilot-import-template.csv',
            )
          }
        >
          <Download /> Template
        </Button>
      </div>

      {localError && <Alert>{localError}</Alert>}
      {importer.isError && (
        <Alert>
          {getErrorMessage(importer.error)}
          {missingColumns && <p className="mt-0.5">Missing: {missingColumns.join(', ')}</p>}
        </Alert>
      )}
      {importer.isPending && !preview && (
        <p className="text-[13px] text-muted">Checking the file…</p>
      )}

      {preview && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Rows', preview.rows],
              ['New', preview.created],
              ['Updated', preview.updated],
              ['New categories', preview.categories_created],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-surface p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-xl font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          {preview.errors.length === 0 ? (
            <Alert tone="success">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Looks good: ready to apply.
              </span>
            </Alert>
          ) : (
            <div className="overflow-hidden rounded-xl border border-danger/30">
              <p className="bg-danger/5 px-4 py-2 text-[13px] font-medium text-danger-ink">
                Fix {pluralize(preview.errors.length, 'row')} and choose the file again. Nothing was
                imported.
              </p>
              <table className="w-full text-[13px]">
                <thead className="bg-subtle text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <tr>
                    <th className="w-20 px-4 py-2">Row</th>
                    <th className="px-4 py-2">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.errors.slice(0, 50).map((error) => (
                    <tr key={error.row}>
                      <td className="px-4 py-2 font-mono text-muted">{error.row}</td>
                      <td className="px-4 py-2 text-foreground">{error.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={apply}
          disabled={!canApply}
          loading={importer.isPending && preview !== null}
        >
          Apply import
        </Button>
      </div>
    </div>
  )
}
