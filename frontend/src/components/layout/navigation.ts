import {
  LayoutDashboard,
  Lightbulb,
  Package,
  ReceiptText,
  ScanBarcode,
  Settings,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/api/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  minimumRole?: Role
  /** For modules that aren't released yet: shown disabled with a "Soon" tag. */
  comingSoon?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Sell',
    items: [
      { to: '/pos', label: 'Point of sale', icon: ScanBarcode },
      { to: '/orders', label: 'Orders', icon: ReceiptText },
    ],
  },
  {
    label: 'Stock',
    items: [
      { to: '/products', label: 'Products', icon: Package },
      { to: '/inventory', label: 'Inventory', icon: Warehouse },
      {
        to: '/purchasing',
        label: 'Purchasing',
        icon: Truck,
      },
    ],
  },
  {
    label: 'Analyze',
    items: [{ to: '/insights', label: 'Insights', icon: Lightbulb }],
  },
  {
    label: 'Admin',
    items: [
      { to: '/team', label: 'Team', icon: Users, minimumRole: 'manager' },
      { to: '/settings', label: 'Settings', icon: Settings, minimumRole: 'owner' },
    ],
  },
]

/** Flat list, e.g. for the command palette and breadcrumbs. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)
