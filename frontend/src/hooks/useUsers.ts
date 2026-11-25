import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/api/users'
import type { UserUpdateInput, UUID } from '@/api/types'
import { queryKeys } from './queryKeys'

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users.all, queryFn: usersApi.list })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: UserUpdateInput }) => usersApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
  })
}
