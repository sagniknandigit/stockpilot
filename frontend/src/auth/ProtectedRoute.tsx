import { Navigate, Outlet, useLocation } from 'react-router'
import type { Role } from '@/api/types'
import { useAuth } from './AuthContext'
import { can } from './roles'

interface ProtectedRouteProps {
  /** Minimum role required; defaults to any signed-in user. */
  minimumRole?: Role
}

export function ProtectedRoute({ minimumRole }: ProtectedRouteProps) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (minimumRole && !can(user.role, minimumRole)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

/** Login/register: bounce already-signed-in users to the dashboard. */
export function GuestRoute() {
  const { user } = useAuth()
  return user ? <Navigate to="/" replace /> : <Outlet />
}
