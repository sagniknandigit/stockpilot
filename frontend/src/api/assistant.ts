import { api } from './client'
import type { AssistantAnswer } from './types'

export const assistantApi = {
  ask: (question: string) => api.post<AssistantAnswer>('/assistant/ask', { question }),
}
