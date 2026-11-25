import { Package, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCan, useSession } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useCategories, useProducts } from '@/hooks/useCatalog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/lib/errors'
import { NewProductDialog } from './NewProductDialog'
import { priceRange } from './productUtils'

const PAGE_SIZE = 20

export function ProductsPage() {
  const { organization } = useSession()
  const canManage = useCan('manager')
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const q = useDebouncedValue(search.trim())

  const categories = useCategories()
  const products = useProducts({
    page,
    size: PAGE_SIZE,
    q: q || undefined,
    category_id: categoryId || undefined,
    include_inactive: includeInactive,
  })
  const hasFilters = Boolean(q || categoryId)

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalog: products, their variants and prices."
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New product
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search name, SKU or barcode…"
              aria-label="Search products"
              className="pl-9"
            />
          </div>
          <Select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by category"
            className="w-48"
          >
            <option value="">All categories</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Switch
            label="Show inactive"
            checked={includeInactive}
            onChange={(checked) => {
              setIncludeInactive(checked)
              setPage(1)
            }}
          />
        </div>

        {products.isError ? (
          <Alert className="m-4">{getErrorMessage(products.error)}</Alert>
        ) : products.data?.total === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Search}
              title="No matching products"
              description="Try a different search or category."
            />
          ) : (
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Add your first product to start tracking stock and selling."
              action={
                canManage && (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> New product
                  </Button>
                )
              }
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Variants</TH>
                  <TH className="text-right">Price</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {products.isPending ? (
                  <TableSkeleton columns={5} />
                ) : (
                  products.data.items.map((product) => (
                    <TR
                      key={product.id}
                      className="cursor-pointer hover:bg-subtle/60"
                      onClick={() => navigate(`/products/${product.id}`)}
                    >
                      <TD className="min-w-48">
                        {/* A real link keeps rows keyboard- and middle-click friendly. */}
                        <Link
                          to={`/products/${product.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="max-w-xs truncate text-xs text-muted">
                          {product.variants.map((v) => v.sku).join(', ')}
                        </p>
                      </TD>
                      <TD className="text-muted">{product.category?.name ?? '—'}</TD>
                      <TD className="text-right tabular-nums">{product.variants.length}</TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">
                        {priceRange(product, organization.currency)}
                      </TD>
                      <TD>
                        {product.is_active ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge>Inactive</Badge>
                        )}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
            {products.data && (
              <Pagination
                page={page}
                size={PAGE_SIZE}
                total={products.data.total}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <NewProductDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
