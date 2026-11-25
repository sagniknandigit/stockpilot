import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCan } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/toast'
import { useCreateUser } from '@/hooks/useUsers'
import { emailField, nameField, passwordField } from '@/lib/validation'

const schema = z.object({
  full_name: nameField('Name'),
  email: emailField,
  password: passwordField,
  role: z.enum(['staff', 'manager']),
})
type AddUserForm = z.infer<typeof schema>

export function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add team member"
      description="They can sign in right away with this temporary password."
    >
      <AddUserFormBody onDone={onClose} />
    </Dialog>
  )
}

function AddUserFormBody({ onDone }: { onDone: () => void }) {
  const isOwner = useCan('owner')
  const createUser = useCreateUser()
  const form = useForm<AddUserForm>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', role: 'staff' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) =>
    createUser.mutate(values, {
      onSuccess: (user) => {
        toast.success('Team member added', `${user.full_name} can now sign in.`)
        onDone()
      },
    }),
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Full name" error={errors.full_name?.message}>
        {(props) => (
          <Input autoFocus autoComplete="off" {...props} {...form.register('full_name')} />
        )}
      </Field>
      <Field label="Email" error={errors.email?.message}>
        {(props) => (
          <Input type="email" autoComplete="off" {...props} {...form.register('email')} />
        )}
      </Field>
      <Field
        label="Temporary password"
        error={errors.password?.message}
        hint="At least 8 characters. Share it securely."
      >
        {(props) => (
          <Input
            type="text"
            autoComplete="new-password"
            {...props}
            {...form.register('password')}
          />
        )}
      </Field>
      <Field
        label="Role"
        error={errors.role?.message}
        hint={
          isOwner
            ? 'Managers can manage stock, products and refunds.'
            : 'Only the owner can add managers.'
        }
      >
        {(props) => (
          <Select {...props} {...form.register('role')}>
            <option value="staff">Staff — sell and view</option>
            {isOwner && <option value="manager">Manager — manage inventory and team</option>}
          </Select>
        )}
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={createUser.isPending}>
          Add member
        </Button>
      </div>
    </form>
  )
}
