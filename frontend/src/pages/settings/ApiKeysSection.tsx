import { BookOpen, KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ApiKey } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { ROLE_LABELS } from '@/auth/roles'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { toast } from '@/components/ui/toast'
import { useApiKeys, useRevokeApiKey } from '@/hooks/useIntegrations'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatRelative } from '@/lib/format'
import { absoluteApiBase, docsUrl } from './apiUrls'
import { CreateApiKeyDialog } from './CreateApiKeyDialog'

export function ApiKeysSection() {
  const { organization } = useSession()
  const keys = useApiKeys()
  const revoke = useRevokeApiKey()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  return (
    <section
      aria-labelledby="api-keys-title"
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      <Card>
        <CardHeader
          icon={<KeyRound />}
          title={<span id="api-keys-title">API keys</span>}
          description="Let other systems read and update your store."
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Create API key
            </Button>
          }
        />
        {keys.isError ? (
          <Alert className="m-4">{getErrorMessage(keys.error)}</Alert>
        ) : keys.data?.length === 0 ? (
          <EmptyState
            compact
            icon={KeyRound}
            title="No API keys yet"
            description="Create one to connect your e-commerce store, accounting or a custom script."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Key</TH>
                <TH>Access</TH>
                <TH>Last used</TH>
                <TH>Status</TH>
                <TH className="w-px">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {keys.isPending ? (
                <TableSkeleton columns={6} rows={2} />
              ) : (
                keys.data.map((key) => (
                  <TR key={key.id} className={key.revoked_at ? 'opacity-60' : undefined}>
                    <TD className="min-w-36">
                      <p className="font-medium text-foreground">{key.name}</p>
                      <p className="text-xs text-muted">
                        Created {formatDate(key.created_at, organization.timezone)}
                      </p>
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-muted">
                      {key.prefix}…
                    </TD>
                    <TD>
                      <Badge tone={key.role === 'manager' ? 'info' : 'neutral'}>
                        {ROLE_LABELS[key.role]}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {key.last_used_at ? formatRelative(key.last_used_at) : 'Never'}
                    </TD>
                    <TD>
                      {key.revoked_at ? (
                        <Badge tone="danger" dot>
                          Revoked
                        </Badge>
                      ) : (
                        <Badge tone="success" dot>
                          Active
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      {!key.revoked_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-ink"
                          onClick={() => setRevoking(key)}
                          aria-label={`Revoke ${key.name}`}
                        >
                          Revoke
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-foreground">Using the API</h3>
        <p className="mt-1 text-[13px] text-muted">
          Send the key in the <code className="font-mono">X-API-Key</code> header.
        </p>
        <CodeBlock
          className="mt-3"
          code={`curl -H "X-API-Key: sp_…" \\\n  ${absoluteApiBase()}/catalog/products`}
        />
        <a
          href={docsUrl()}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
        >
          <BookOpen className="size-4" aria-hidden="true" /> Interactive API reference
        </a>
      </Card>

      <CreateApiKeyDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Anything using this key stops working immediately. This can’t be undone."
        confirmLabel="Revoke key"
        destructive
        loading={revoke.isPending}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: (key) => {
              toast.success(`${key.name} revoked`)
              setRevoking(null)
            },
          })
        }
      />
    </section>
  )
}
