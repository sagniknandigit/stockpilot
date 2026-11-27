import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useProduct } from '@/hooks/useCatalog'
import { usePurchaseOrder } from '@/hooks/usePurchasing'
import { formatPoNumber } from '@/pages/purchasing/status'
import { NAV_ITEMS } from './navigation'

/** Derived from the URL; a product detail page shows the product's name from the query cache. */
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const [section, sub, id, action] = pathname.split('/').filter(Boolean)
  const page = NAV_ITEMS.find((item) => item.to === `/${section ?? ''}`)
  const product = useProduct(section === 'products' ? sub : undefined)
  const order = usePurchaseOrder(section === 'purchasing' && sub === 'orders' ? id : undefined)

  const crumbs: { label: string; to?: string }[] = [
    { label: page?.label ?? 'Not found', to: sub ? page?.to : undefined },
  ]
  if (section === 'products' && sub) crumbs.push({ label: product.data?.name ?? 'Product' })
  if (section === 'purchasing' && sub === 'suppliers') crumbs.push({ label: 'Suppliers' })
  if (section === 'purchasing' && sub === 'new') crumbs.push({ label: 'New purchase order' })
  if (section === 'purchasing' && sub === 'orders') {
    const label = order.data ? formatPoNumber(order.data.number) : 'Purchase order'
    crumbs.push({ label, to: action ? `/purchasing/orders/${id}` : undefined })
    if (action === 'edit') crumbs.push({ label: 'Edit' })
  }
  if (section === 'settings')
    crumbs.push({ label: sub === 'webhooks' ? 'Webhook endpoint' : 'Integrations' })
  if (section === 'insights')
    crumbs.push({ label: sub === 'analytics' ? 'Analytics' : 'Reorder planner' })

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-muted/60" aria-hidden="true" />
              )}
              {crumb.to && !last ? (
                <Link to={crumb.to} className="truncate text-muted hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="truncate font-medium text-foreground"
                  aria-current={last ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
