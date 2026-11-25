import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '@/api/auth'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { tokenStore } from '@/api/tokenStore'
import type { AuthResponse, Me } from '@/api/types'
import { readStorage, writeStorage } from '@/lib/utils'
import { AuthContext, type AuthContextValue } from './AuthContext'

const SESSION_KEY = 'stockpilot.session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasTokens, setHasTokens] = useState(() => tokenStore.get() !== null)
  // The cached profile lets the app render instantly on reload; /auth/me then refreshes it.
  const [session, setSession] = useState<Me | null>(() =>
    tokenStore.get() ? readStorage<Me>(SESSION_KEY) : null,
  )

  const reset = useCallback(() => {
    setSession(null)
    writeStorage(SESSION_KEY, null)
    queryClient.clear()
  }, [queryClient])

  // The API client clears tokens when a refresh fails; mirror that in React state.
  useEffect(
    () =>
      tokenStore.subscribe((tokens) => {
        setHasTokens(tokens !== null)
        if (!tokens) reset()
      }),
    [reset],
  )

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: hasTokens,
    staleTime: 5 * 60_000,
  })

  const fresh = me.data
  useEffect(() => {
    if (fresh) writeStorage(SESSION_KEY, fresh)
  }, [fresh])

  const signIn = useCallback(
    (response: AuthResponse) => {
      queryClient.clear()
      const next: Me = { user: response.user, organization: response.organization }
      writeStorage(SESSION_KEY, next)
      setSession(next)
      queryClient.setQueryData(['auth', 'me'], next)
      tokenStore.set({
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
      })
    },
    [queryClient],
  )

  const signOut = useCallback(() => tokenStore.clear(), [])

  const current = hasTokens ? (fresh ?? session) : null
  const value = useMemo<AuthContextValue>(
    () => ({
      user: current?.user ?? null,
      organization: current?.organization ?? null,
      isAuthenticated: current !== null,
      signIn,
      signOut,
    }),
    [current, signIn, signOut],
  )

  // Tokens but no cached profile yet: wait for /auth/me before deciding where to route.
  if (hasTokens && !current && me.isPending) return <FullPageSpinner />

  return <AuthContext value={value}>{children}</AuthContext>
}
