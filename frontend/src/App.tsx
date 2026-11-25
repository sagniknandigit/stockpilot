import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { Toaster } from '@/components/ui/Toaster'
import { queryClient } from '@/lib/queryClient'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
