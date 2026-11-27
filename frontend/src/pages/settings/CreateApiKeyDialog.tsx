import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ApiKeyCreated } from '@/api/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { CopyButton } from '@/components/ui/CopyButton'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCreateApiKey } from '@/hooks/useIntegrations'
import { absoluteApiBase } from './apiUrls'

const schema = z.object({
  name: z.string().trim().min(1, 'Give the key a name').max(100),
  role: z.enum(['staff', 'manager']),
})
type KeyForm = z.infer<typeof schema>

export function CreateApiKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create API key"
      description="For scripts and integrations that call the StockPilot API."
    >
      <CreateApiKeyBody onDone={onClose} />
    </Dialog>
  )
}

function CreateApiKeyBody({ onDone }: { onDone: () => void }) {
  const create = useCreateApiKey()
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)
  const form = useForm<KeyForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', role: 'staff' },
  })
  const { errors } = form.formState

  if (created) {
    // The full key only exists in this response: make that unmissable.
    return (
      <div className="space-y-4">
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <TriangleAlert className="size-4 text-warning-ink" aria-hidden="true" /> Copy this key
            now
          </span>
          <p className="mt-0.5">
            It won’t be shown again. If you lose it, revoke it and create a new one.
          </p>
        </Alert>
        <div className="flex items-center gap-2 rounded-xl border bg-subtle/60 p-2 pl-3">
          <KeyRound className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <code
            className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground"
            data-testid="new-api-key"
          >
            {created.key}
          </code>
          <CopyButton value={created.key} variant="primary" label="Copy key" />
        </div>
        <CodeBlock
          label="Try it"
          code={`curl -H "X-API-Key: ${created.key}" \\\n  ${absoluteApiBase()}/catalog/products`}
        />
        <div className="flex justify-end border-t pt-4">
          <Button onClick={onDone}>I’ve saved it</Button>
        </div>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => create.mutate(values, { onSuccess: setCreated }))}
    >
      <Field label="Name" error={errors.name?.message} hint="Where it’s used, e.g. “Shopify sync”.">
        {(props) => <Input autoFocus {...props} {...form.register('name')} />}
      </Field>
      <Field label="Access" hint="The key acts with this role’s permissions.">
        {(props) => (
          <Select {...props} {...form.register('role')}>
            <option value="staff">Staff — read data and create sales</option>
            <option value="manager">Manager — also manage stock, products and purchasing</option>
          </Select>
        )}
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Create key
        </Button>
      </div>
    </form>
  )
}
