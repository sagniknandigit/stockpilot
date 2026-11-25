import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { GuestRoute, ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { PageLoader } from '@/components/ui/PageLoader'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/** Route-level code splitting: each page (and heavy deps like Recharts) loads on demand. */
function lazyPage<K extends string>(load: () => Promise<{ [P in K]: ComponentType }>, name: K) {
  const Page = lazy(async () => ({ default: (await load())[name] as ComponentType }))
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: lazyPage(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage'),
          },
          { path: 'pos', element: lazyPage(() => import('@/pages/pos/PosPage'), 'PosPage') },
          {
            path: 'products',
            element: lazyPage(() => import('@/pages/products/ProductsPage'), 'ProductsPage'),
          },
          {
            path: 'products/:productId',
            element: lazyPage(
              () => import('@/pages/products/ProductDetailPage'),
              'ProductDetailPage',
            ),
          },
          {
            path: 'inventory',
            element: lazyPage(() => import('@/pages/inventory/InventoryPage'), 'InventoryPage'),
          },
          {
            path: 'orders',
            element: lazyPage(() => import('@/pages/orders/OrdersPage'), 'OrdersPage'),
          },
          {
            element: <ProtectedRoute minimumRole="manager" />,
            children: [
              {
                path: 'team',
                element: lazyPage(() => import('@/pages/team/TeamPage'), 'TeamPage'),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
