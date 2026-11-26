import { useMutation } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'
import { authApi } from '@/api/auth'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toast'
import { getErrorMessage } from '@/lib/errors'

/** Public demo tenant with ~90 days of sample data. */
const DEMO_CREDENTIALS = { email: 'demo@stockpilot.app', password: 'demo-password' }

export function DemoLoginButton() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const demo = useMutation({
    mutationFn: () => authApi.login(DEMO_CREDENTIALS),
    meta: { silentError: true },
    onSuccess: (session) => {
      signIn(session)
      navigate('/', { replace: true })
    },
    onError: (error) => toast.error('Demo is unavailable', getErrorMessage(error)),
  })

  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      onClick={() => demo.mutate()}
      loading={demo.isPending}
    >
      {!demo.isPending && <Sparkles className="text-accent" />} Try the live demo
    </Button>
  )
}
