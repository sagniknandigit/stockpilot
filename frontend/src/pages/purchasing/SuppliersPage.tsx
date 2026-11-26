import { Clock, Mail, Pencil, Phone, Plus, Truck } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Supplier } from '@/api/types'
import { useCan } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/toast'
import { useSuppliers, useUpdateSupplier } from '@/hooks/usePurchasing'
import { getErrorMessage } from '@/lib/errors'
import { fadeUp, stagger } from '@/lib/motion'
import { PurchasingTabs } from './PurchasingTabs'
import { SupplierDialog } from './SupplierDialog'

export function SuppliersPage() {
  const canManage = useCan('manager')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<{ supplier: Supplier | null } | null>(null)
  const suppliers = useSuppliers(showInactive)
  const update = useUpdateSupplier()

  return (
    <>
      <PageHeader
        title="Purchasing"
        description="The suppliers you buy from, and how long they take to deliver."
        actions={
          canManage && (
            <Button onClick={() => setEditing({ supplier: null })}>
              <Plus /> Add supplier
            </Button>
          )
        }
      />
      <PurchasingTabs />
      <div className="mb-4 flex justify-end">
        <Switch label="Show inactive" checked={showInactive} onChange={setShowInactive} />
      </div>

      {suppliers.isError ? (
        <Alert>{getErrorMessage(suppliers.error)}</Alert>
      ) : suppliers.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : suppliers.data.length === 0 ? (
        <div className="rounded-2xl border bg-surface">
          <EmptyState
            icon={Truck}
            title="No suppliers yet"
            description="Add the wholesalers you buy from to start creating purchase orders."
            action={
              canManage && (
                <Button onClick={() => setEditing({ supplier: null })}>
                  <Plus /> Add supplier
                </Button>
              )
            }
          />
        </div>
      ) : (
        <motion.ul
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {suppliers.data.map((supplier) => (
            <motion.li
              key={supplier.id}
              variants={fadeUp}
              className="flex flex-col rounded-2xl border bg-surface p-5 shadow-card transition-shadow hover:shadow-pop"
            >
              <div className="flex items-start gap-3">
                <Avatar name={supplier.name} square size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-foreground">{supplier.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3.5" aria-hidden="true" /> {supplier.lead_time_days}-day
                    lead time
                  </p>
                </div>
                {!supplier.is_active && <Badge dot>Inactive</Badge>}
              </div>
              <dl className="mt-4 space-y-1.5 text-[13px]">
                <div className="flex items-center gap-2 text-muted">
                  <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">Email</dt>
                  <dd className="truncate">
                    {supplier.email ? (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {supplier.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">Phone</dt>
                  <dd>{supplier.phone ?? '—'}</dd>
                </div>
              </dl>
              {supplier.notes && (
                <p className="mt-3 line-clamp-2 text-xs text-muted">{supplier.notes}</p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
                <Link
                  to={`/purchasing?supplier=${supplier.id}`}
                  aria-label={`Purchase orders from ${supplier.name}`}
                  className="text-[13px] font-medium text-accent hover:underline"
                >
                  Purchase orders
                </Link>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Switch
                      label={supplier.is_active ? 'Active' : 'Inactive'}
                      checked={supplier.is_active}
                      disabled={update.isPending}
                      onChange={(is_active) =>
                        update.mutate(
                          { id: supplier.id, input: { is_active } },
                          {
                            onSuccess: () =>
                              toast.success(
                                `${supplier.name} ${is_active ? 'activated' : 'deactivated'}`,
                              ),
                          },
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditing({ supplier })}
                      aria-label={`Edit ${supplier.name}`}
                    >
                      <Pencil />
                    </Button>
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}
      <SupplierDialog
        open={editing !== null}
        supplier={editing?.supplier ?? null}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
