import {
  LayoutDashboard,
  Package,
  ReceiptText,
  ScanBarcode,
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
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pos', label: 'Point of sale', icon: ScanBarcode },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/orders', label: 'Orders', icon: ReceiptText },
  { to: '/team', label: 'Team', icon: Users, minimumRole: 'manager' },
]
