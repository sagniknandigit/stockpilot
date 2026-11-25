import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCan } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { useLocations } from '@/hooks/useInventory'
import { LocationsTab } from './LocationsTab'
import { MovementsTab } from './MovementsTab'
import { ReconcileDialog } from './ReconcileDialog'
import { StockTab } from './StockTab'

const TABS = [
  { value: 'stock', label: 'Stock levels' },
  { value: 'movements', label: 'Movements' },
  { value: 'locations', label: 'Locations' },
] as const
type Tab = (typeof TABS)[number]['value']

export function InventoryPage() {
  const canManage = useCan('manager')
  const [params, setParams] = useSearchParams()
  const [reconciling, setReconciling] = useState(false)
  const locations = useLocations()
  const activeLocations = (locations.data ?? []).filter((l) => l.is_active)

  // Tab and the low-stock filter live in the URL, so the dashboard can deep-link here.
  const tab: Tab = TABS.some((t) => t.value === params.get('tab'))
    ? (params.get('tab') as Tab)
    : 'stock'
  const lowOnly = params.get('low') === '1'

  function update(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand across your locations, backed by an auditable ledger."
        actions={
          canManage && (
            <Button variant="secondary" onClick={() => setReconciling(true)}>
              <ShieldCheck /> Reconcile
            </Button>
          )
        }
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs
            label="Inventory sections"
            tabs={[...TABS]}
            value={tab}
            onChange={(value) => update({ tab: value === 'stock' ? null : value })}
          />
        </div>
        <div role="tabpanel">
          {tab === 'stock' && (
            <StockTab
              locations={activeLocations}
              lowOnly={lowOnly}
              onLowOnlyChange={(value) => update({ low: value ? '1' : null })}
            />
          )}
          {tab === 'movements' && <MovementsTab locations={locations.data ?? []} />}
          {tab === 'locations' && <LocationsTab locations={locations.data ?? []} />}
        </div>
      </Card>
      <ReconcileDialog open={reconciling} onClose={() => setReconciling(false)} />
    </>
  )
}
