import { zodResolver } from '@hookform/resolvers/zod'
import { MapPin, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { Location } from '@/api/types'
import { useCan } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { toast } from '@/components/ui/toast'
import { useCreateLocation } from '@/hooks/useInventory'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{1,20}$/, 'Up to 20 characters: A–Z, 0–9, _ or -'),
  address: z.string().trim(),
})
type LocationForm = z.infer<typeof schema>

export function LocationsTab({ locations }: { locations: Location[] }) {
  const canManage = useCan('manager')

  return (
    <div className="grid lg:grid-cols-3">
      <div className="lg:col-span-2 lg:border-r">
        {locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No locations"
            description="Add a store or warehouse to hold stock."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Code</TH>
                <TH>Address</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {locations.map((location) => (
                <TR key={location.id}>
                  <TD className="font-medium text-foreground">{location.name}</TD>
                  <TD>
                    <Badge>{location.code}</Badge>
                  </TD>
                  <TD className="text-muted">{location.address ?? '—'}</TD>
                  <TD>
                    {location.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge>Inactive</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      {canManage && <NewLocationForm />}
    </div>
  )
}

function NewLocationForm() {
  const createLocation = useCreateLocation()
  const form = useForm<LocationForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', address: '' },
  })
  const { errors } = form.formState
  const codeField = form.register('code')

  const onSubmit = form.handleSubmit((values) =>
    createLocation.mutate(
      { name: values.name, code: values.code, address: values.address || null },
      {
        onSuccess: (location) => {
          toast.success('Location added', `${location.name} (${location.code})`)
          form.reset()
        },
      },
    ),
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 border-t p-5 lg:border-t-0">
      <div>
        <h3 className="font-semibold text-foreground">Add location</h3>
        <p className="text-[13px] text-muted">A store, stockroom or warehouse.</p>
      </div>
      <Field label="Name" error={errors.name?.message}>
        {(props) => <Input placeholder="Downtown Store" {...props} {...form.register('name')} />}
      </Field>
      <Field label="Code" error={errors.code?.message} hint="Short unique code, shown on receipts.">
        {(props) => (
          <Input
            placeholder="DT"
            className="font-mono uppercase"
            {...props}
            {...codeField}
            onChange={(event) => {
              event.target.value = event.target.value.toUpperCase()
              return codeField.onChange(event)
            }}
          />
        )}
      </Field>
      <Field label="Address" error={errors.address?.message}>
        {(props) => <Input placeholder="Optional" {...props} {...form.register('address')} />}
      </Field>
      <Button type="submit" className="w-full" loading={createLocation.isPending}>
        <Plus /> Add location
      </Button>
    </form>
  )
}
