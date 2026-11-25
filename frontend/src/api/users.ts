import { api } from './client'
import type { User, UserCreateInput, UserUpdateInput, UUID } from './types'

export const usersApi = {
  list: () => api.get<User[]>('/users'),
  create: (input: UserCreateInput) => api.post<User>('/users', input),
  update: (id: UUID, input: UserUpdateInput) => api.patch<User>(`/users/${id}`, input),
}
