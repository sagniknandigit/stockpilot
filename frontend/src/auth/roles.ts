import type { Role } from '@/api/types'

const RANK: Record<Role, number> = { staff: 0, manager: 1, owner: 2 }

/** True if `role` is at least `minimum` in the owner > manager > staff hierarchy. */
export function can(role: Role | undefined, minimum: Role): boolean {
  return role !== undefined && RANK[role] >= RANK[minimum]
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
}
