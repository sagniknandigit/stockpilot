import { UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import type { Role, User } from '@/api/types'
import { useCan, useSession } from '@/auth/AuthContext'
import { ROLE_LABELS } from '@/auth/roles'
import { Alert } from '@/components/ui/Alert'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Select'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { toast } from '@/components/ui/toast'
import { useUpdateUser, useUsers } from '@/hooks/useUsers'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { AddUserDialog } from './AddUserDialog'

const ROLE_TONES: Record<Role, BadgeTone> = { owner: 'accent', manager: 'info', staff: 'neutral' }

export function TeamPage() {
  const { user: me, organization } = useSession()
  const isOwner = useCan('owner')
  const users = useUsers()
  const updateUser = useUpdateUser()
  const [adding, setAdding] = useState(false)
  const [deactivating, setDeactivating] = useState<User | null>(null)

  // Only the owner can edit others; nobody can edit themselves or the owner account.
  const editable = (user: User) => isOwner && user.id !== me.id && user.role !== 'owner'

  return (
    <>
      <PageHeader
        title="Team"
        description="People who can access this workspace."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add member
          </Button>
        }
      />
      <Card>
        {users.isError ? (
          <Alert className="m-4">{getErrorMessage(users.error)}</Alert>
        ) : users.data?.length === 0 ? (
          <EmptyState icon={Users} title="No team members" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                {isOwner && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {users.isPending ? (
                <TableSkeleton columns={isOwner ? 5 : 4} rows={3} />
              ) : (
                users.data.map((user) => (
                  <TR key={user.id}>
                    <TD className="min-w-52">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.full_name} brand={user.id === me.id} />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {user.full_name}
                            {user.id === me.id && (
                              <span className="font-normal text-muted"> (you)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted">{user.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {editable(user) ? (
                        <Select
                          aria-label={`Role for ${user.full_name}`}
                          value={user.role}
                          className="w-36"
                          disabled={updateUser.isPending}
                          onChange={(event) =>
                            updateUser.mutate(
                              {
                                id: user.id,
                                input: { role: event.target.value as 'staff' | 'manager' },
                              },
                              {
                                onSuccess: (u) =>
                                  toast.success(
                                    `${u.full_name} is now ${ROLE_LABELS[u.role].toLowerCase()}`,
                                  ),
                              },
                            )
                          }
                        >
                          <option value="staff">Staff</option>
                          <option value="manager">Manager</option>
                        </Select>
                      ) : (
                        <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                      )}
                    </TD>
                    <TD>
                      {user.is_active ? (
                        <Badge tone="success" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge dot>Deactivated</Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatDate(user.created_at, organization.timezone)}
                    </TD>
                    {isOwner && (
                      <TD className="text-right">
                        {editable(user) &&
                          (user.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger-ink"
                              onClick={() => setDeactivating(user)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={updateUser.isPending}
                              onClick={() =>
                                updateUser.mutate(
                                  { id: user.id, input: { is_active: true } },
                                  { onSuccess: (u) => toast.success(`${u.full_name} reactivated`) },
                                )
                              }
                            >
                              Reactivate
                            </Button>
                          ))}
                      </TD>
                    )}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        )}
      </Card>

      <AddUserDialog open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title={`Deactivate ${deactivating?.full_name}?`}
        description="They’ll be signed out and won’t be able to sign in until reactivated."
        confirmLabel="Deactivate"
        destructive
        loading={updateUser.isPending}
        onConfirm={() =>
          deactivating &&
          updateUser.mutate(
            { id: deactivating.id, input: { is_active: false } },
            {
              onSuccess: (u) => {
                toast.success(`${u.full_name} deactivated`)
                setDeactivating(null)
              },
            },
          )
        }
      />
    </>
  )
}
