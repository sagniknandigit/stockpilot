/**
 * TypeScript mirrors of the backend Pydantic schemas (backend/app/schemas).
 * UUIDs and datetimes are strings; Decimal money fields are serialized as strings ("12.50").
 */

export type UUID = string
/** ISO-8601 datetime string. */
export type DateTime = string
/** Decimal serialized as a string, e.g. "12.50". */
export type Money = string

export type Role = 'owner' | 'manager' | 'staff'
export type OrderStatus = 'completed' | 'refunded'
export type MovementReason =
  | 'initial'
  | 'adjustment'
  | 'damage'
  | 'purchase_receipt'
  | 'sale'
  | 'return'
  | 'transfer_in'
  | 'transfer_out'
export type AdjustmentReason = Extract<MovementReason, 'initial' | 'adjustment' | 'damage'>

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface PageParams {
  page?: number
  size?: number
}

// --- Auth & team ---------------------------------------------------------------------------

export interface User {
  id: UUID
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: DateTime
}

export interface Organization {
  id: UUID
  name: string
  slug: string
  currency: string
  /** IANA time zone, e.g. "Asia/Kolkata". Reports bucket days in this zone. */
  timezone: string
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface Me {
  user: User
  organization: Organization
}

export interface AuthResponse extends Me {
  tokens: TokenPair
}

export interface RegisterInput {
  organization_name: string
  full_name: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface UserCreateInput {
  email: string
  full_name: string
  password: string
  role: Exclude<Role, 'owner'>
}

export interface UserUpdateInput {
  full_name?: string
  role?: Exclude<Role, 'owner'>
  is_active?: boolean
}

// --- Catalog -------------------------------------------------------------------------------

export interface Category {
  id: UUID
  name: string
}

export interface Variant {
  id: UUID
  product_id: UUID
  name: string
  sku: string
  barcode: string | null
  attributes: Record<string, unknown>
  price: Money
  cost: Money
  reorder_point: number
  is_active: boolean
}

export interface Product {
  id: UUID
  name: string
  description: string | null
  category: Category | null
  is_active: boolean
  created_at: DateTime
  variants: Variant[]
}

export interface VariantInput {
  name: string
  sku: string
  barcode?: string | null
  attributes?: Record<string, string>
  price: Money
  cost?: Money
  reorder_point?: number
}

export interface VariantUpdateInput {
  name?: string
  barcode?: string | null
  price?: Money
  cost?: Money
  reorder_point?: number
  is_active?: boolean
}

export interface ProductInput {
  name: string
  description?: string | null
  category_id?: UUID | null
  variants: VariantInput[]
}

export interface ProductUpdateInput {
  name?: string
  description?: string | null
  category_id?: UUID | null
  is_active?: boolean
}

export interface ProductListParams extends PageParams {
  q?: string
  category_id?: UUID
  include_inactive?: boolean
}

/** A variant as the POS sees it, with the sellable quantity at one location. */
export interface VariantSearchResult {
  id: UUID
  product_id: UUID
  product_name: string
  name: string
  sku: string
  barcode: string | null
  price: Money
  available: number
}

// --- Inventory -----------------------------------------------------------------------------

export interface Location {
  id: UUID
  name: string
  code: string
  address: string | null
  is_active: boolean
}

export interface LocationInput {
  name: string
  code: string
  address?: string | null
}

export interface StockRow {
  variant_id: UUID
  sku: string
  variant_name: string
  product_id: UUID
  product_name: string
  location_id: UUID
  location_code: string
  on_hand: number
  reserved: number
  available: number
  /** Available across all locations; `is_low` compares this to the reorder point. */
  variant_available: number
  reorder_point: number
  is_low: boolean
}

export interface StockListParams extends PageParams {
  location_id?: UUID
  q?: string
  low_stock?: boolean
}

export interface StockLevel {
  variant_id: UUID
  location_id: UUID
  on_hand: number
  reserved: number
  available: number
}

export interface AdjustmentInput {
  variant_id: UUID
  location_id: UUID
  quantity: number
  reason: AdjustmentReason
  note?: string | null
}

export interface TransferInput {
  variant_id: UUID
  from_location_id: UUID
  to_location_id: UUID
  quantity: number
  note?: string | null
}

export interface Movement {
  id: UUID
  variant_id: UUID
  sku: string
  product_name: string
  variant_name: string
  location_id: UUID
  location_code: string
  quantity: number
  reason: MovementReason
  reference_type: string | null
  reference_id: UUID | null
  note: string | null
  created_by: UUID | null
  created_at: DateTime
}

export interface MovementListParams extends PageParams {
  variant_id?: UUID
  location_id?: UUID
}

export interface ReconcileMismatch {
  variant_id: UUID
  location_id: UUID
  on_hand: number
  ledger_total: number
}

export interface ReconcileResult {
  checked: number
  mismatches: ReconcileMismatch[]
}

// --- Sales ---------------------------------------------------------------------------------

export interface OrderLineInput {
  variant_id: UUID
  quantity: number
  /** Price override; requires the manager role. */
  unit_price?: Money | null
}

export interface OrderInput {
  location_id: UUID
  lines: OrderLineInput[]
  customer_name?: string | null
  /** Requires the manager role when non-zero. */
  discount?: Money
}

export interface OrderLine {
  id: UUID
  variant_id: UUID
  sku: string
  name: string
  quantity: number
  unit_price: Money
  line_total: Money
}

export interface Order {
  id: UUID
  number: number
  status: OrderStatus
  location_id: UUID
  location_code: string
  customer_name: string | null
  subtotal: Money
  discount: Money
  total: Money
  created_by: UUID | null
  created_at: DateTime
  refunded_at: DateTime | null
  lines: OrderLine[]
}

export interface OrderListParams extends PageParams {
  status?: OrderStatus
  location_id?: UUID
  date_from?: DateTime
  date_to?: DateTime
}

/** `details` of a 409 `insufficient_stock` error. */
export interface StockShortage {
  variant_id: UUID
  location_id: UUID
  requested: number
  available: number
}

// --- Reports -------------------------------------------------------------------------------

export interface DailySales {
  /** Calendar date, "YYYY-MM-DD" (UTC). */
  day: string
  orders: number
  revenue: Money
}

export interface Summary {
  active_products: number
  active_variants: number
  units_on_hand: number
  inventory_value: Money
  low_stock_count: number
  today_orders: number
  today_revenue: Money
  last_7_days: DailySales[]
}
