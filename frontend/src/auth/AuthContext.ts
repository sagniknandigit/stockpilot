import { createContext, useContext } from 'react'
import type { AuthResponse, Organization, Role, User } from '@/api/types'
import { can } from './roles'

export interface AuthContextValue {
  user: User | null
  organization: Organization | null
  isAuthenticated: boolean
  /** Store the session returned by /auth/login or /auth/register. */
  signIn: (session: AuthResponse) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** The signed-in session. Only use below <ProtectedRoute>, where it is guaranteed to exist. */
export function useSession(): { user: User; organization: Organization } {
  const { user, organization } = useAuth()
  if (!user || !organization) throw new Error('useSession requires an authenticated user')
  return { user, organization }
}

/** `const canManage = useCan('manager')` */
export function useCan(minimum: Role): boolean {
  return can(useAuth().user?.role, minimum)
}
