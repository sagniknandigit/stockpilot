import { CircleCheck, TriangleAlert } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/Spinner'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useVariantLookup } from '@/hooks/useCatalog'
import { useLocations, useReconcile } from '@/hooks/useInventory'
import { getErrorMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { shortId } from '@/lib/utils'

export function ReconcileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const result = useReconcile(open)
  const variants = useVariantLookup()
  const locations = useLocations()
  const locationCode = (id: string) => locations.data?.find((l) => l.id === id)?.code ?? shortId(id)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reconcile stock ledger"
      description="Checks that every stock level equals the sum of its movements."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => result.refetch()} loading={result.isFetching}>
            Run again
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {result.isPending ? (
        <div className="flex items-center gap-2 py-6 text-muted">
          <Spinner /> Checking ledger…
        </div>
      ) : result.isError ? (
        <Alert>{getErrorMessage(result.error)}</Alert>
      ) : result.data.mismatches.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-6" aria-hidden="true" />
          </div>
          <p className="font-semibold text-foreground">Ledger matches</p>
          <p className="mt-1 text-[13px] text-muted">
            All {formatNumber(result.data.checked)} stock levels agree with their movement history.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <TriangleAlert className="size-4" aria-hidden="true" />
              {result.data.mismatches.length} of {result.data.checked} stock levels don’t match the
              ledger.
            </span>
          </Alert>
          <div className="rounded-lg border">
            <Table>
              <THead>
                <TR>
                  <TH>Variant</TH>
                  <TH>Location</TH>
                  <TH className="text-right">On hand</TH>
                  <TH className="text-right">Ledger</TH>
                  <TH className="text-right">Diff</TH>
                </TR>
              </THead>
              <TBody>
                {result.data.mismatches.map((m) => {
                  const label = variants.data?.get(m.variant_id)
                  return (
                    <TR key={`${m.variant_id}-${m.location_id}`}>
                      <TD>
                        {label ? `${label.productName} · ${label.sku}` : shortId(m.variant_id)}
                      </TD>
                      <TD>{locationCode(m.location_id)}</TD>
                      <TD className="text-right tabular-nums">{m.on_hand}</TD>
                      <TD className="text-right tabular-nums">{m.ledger_total}</TD>
                      <TD className="text-right font-medium text-red-600 tabular-nums">
                        {m.on_hand - m.ledger_total}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        </div>
      )}
    </Dialog>
  )
}
