import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { authApi } from '@/api/auth'
import { useAuth } from '@/auth/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { getErrorMessage } from '@/lib/errors'
import { emailField, nameField, passwordField } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  organization_name: nameField('Business name'),
  full_name: nameField('Your name'),
  email: emailField,
  password: passwordField,
})
type RegisterForm = z.infer<typeof schema>

export function RegisterPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const form = useForm<RegisterForm>({ resolver: zodResolver(schema) })
  const register = useMutation({
    mutationFn: authApi.register,
    meta: { silentError: true },
    onSuccess: (session) => {
      signIn(session)
      toast.success(`Welcome to StockPilot, ${session.user.full_name.split(' ')[0]}!`)
      navigate('/', { replace: true })
    },
  })
  const { errors } = form.formState

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Set up your store in under a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => register.mutate(values))}
        className="space-y-4"
        noValidate
      >
        {register.isError && <Alert>{getErrorMessage(register.error)}</Alert>}
        <Field label="Business name" error={errors.organization_name?.message}>
          {(props) => (
            <Input
              autoComplete="organization"
              autoFocus
              {...props}
              {...form.register('organization_name')}
            />
          )}
        </Field>
        <Field label="Your name" error={errors.full_name?.message}>
          {(props) => <Input autoComplete="name" {...props} {...form.register('full_name')} />}
        </Field>
        <Field label="Work email" error={errors.email?.message}>
          {(props) => (
            <Input type="email" autoComplete="email" {...props} {...form.register('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters.">
          {(props) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...props}
              {...form.register('password')}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={register.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
