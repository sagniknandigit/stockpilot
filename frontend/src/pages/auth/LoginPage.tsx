import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { authApi } from '@/api/auth'
import { useAuth } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { emailField } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
})
type LoginForm = z.infer<typeof schema>

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const form = useForm<LoginForm>({ resolver: zodResolver(schema) })
  const login = useMutation({
    mutationFn: authApi.login,
    meta: { silentError: true },
    onSuccess: (session) => {
      signIn(session)
      navigate(from, { replace: true })
    },
  })
  const { errors } = form.formState

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your StockPilot workspace."
      footer={
        <>
          New to StockPilot?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="space-y-4"
        noValidate
      >
        {login.isError && <Alert>{getErrorMessage(login.error)}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {(props) => (
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              {...props}
              {...form.register('email')}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(props) => (
            <Input
              type="password"
              autoComplete="current-password"
              {...props}
              {...form.register('password')}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
