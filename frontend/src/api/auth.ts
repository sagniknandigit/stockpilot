import { api } from './client'
import type { AuthResponse, LoginInput, Me, RegisterInput } from './types'

export const authApi = {
  register: (input: RegisterInput) =>
    api.post<AuthResponse>('/auth/register', input, { auth: false }),
  login: (input: LoginInput) => api.post<AuthResponse>('/auth/login', input, { auth: false }),
  me: () => api.get<Me>('/auth/me'),
}
