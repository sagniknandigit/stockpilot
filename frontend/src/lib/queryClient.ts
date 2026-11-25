import { MutationCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { toast } from '@/components/ui/toast'
import { getErrorMessage } from './errors'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Set when the component renders the error itself instead of a toast. */
      silentError?: boolean
    }
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Retry flaky network/5xx errors, never 4xx: those won't succeed on retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.meta?.silentError) toast.error(getErrorMessage(error))
    },
  }),
})
